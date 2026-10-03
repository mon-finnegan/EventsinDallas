import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { NATIONAL_INTERESTS, SIGNUP_TYPES, SUBCATEGORIES } from "../types";
import type { Source } from "./sources";

// AI structured extraction (spec §28). The model turns a page into candidate records; nothing
// it returns is trusted until it passes the evidence check below and the publishing gate.

const nullableString = z.string().nullable();

const DATE_FIELDS = [
  "event_date",
  "end_date",
  "start_time",
  "end_time",
  "signup_open_at",
  "signup_close_at",
  "lottery_open_at",
  "lottery_close_at",
  "ticket_release_at",
] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export const ExtractedEventSchema = z.object({
  title: z.string(),
  description: nullableString,
  kind: z.enum(["dallas_event", "toddler_family_event", "signup_alert"]),
  subcategory: z.enum(SUBCATEGORIES).nullable(),
  national_interest: z.enum(NATIONAL_INTERESTS).nullable(),
  event_date: nullableString.describe("YYYY-MM-DD, only if stated on the page"),
  end_date: nullableString.describe("YYYY-MM-DD, only if stated on the page"),
  start_time: nullableString.describe("HH:MM 24h local, only if stated"),
  end_time: nullableString.describe("HH:MM 24h local, only if stated"),
  venue: nullableString,
  address: nullableString,
  city: nullableString,
  state: nullableString,
  age_min: z.number().int().nullable(),
  age_max: z.number().int().nullable(),
  age_label: nullableString,
  cost: nullableString,
  activities: z.array(z.string()),
  is_toddler_relevant: z.boolean(),
  is_family_relevant: z.boolean(),
  is_church_hosted: z.boolean(),
  is_public_event: z.boolean(),
  is_seasonal: z.boolean(),
  signup_required: z.boolean(),
  signup_type: z.enum(SIGNUP_TYPES).nullable(),
  signup_open_at: nullableString.describe("YYYY-MM-DD or ISO datetime with offset, only if stated"),
  signup_close_at: nullableString,
  lottery_open_at: nullableString,
  lottery_close_at: nullableString,
  ticket_release_at: nullableString,
  action_note: nullableString,
  event_url: nullableString,
  registration_url: nullableString,
  ticket_url: nullableString,
  evidence: z
    .array(
      z.object({
        field: z.enum(DATE_FIELDS),
        quote: z.string().describe("Exact text copied verbatim from the page that states this value"),
      }),
    )
    .describe("One entry per non-null date/time field"),
});
export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

const ExtractionSchema = z.object({ events: z.array(ExtractedEventSchema) });

export type Extractor = (args: { source: Source; text: string; today: string }) => Promise<ExtractedEvent[]>;

const SYSTEM = `You extract events for a curated Dallas family calendar for parents of 1–3 year olds.

Return only specific, dated, public events that a Dallas family would genuinely want to know about:
festivals, parades, seasonal and holiday celebrations, toddler/family programming, church- or
congregation-hosted community events open to the public (fall festivals, trunk-or-treats, egg hunts,
Christmas festivals, cultural food festivals), distinctive experiences that require advance
reservations, and — for national sources — golf majors, Olympics and other coveted experiences with
ticket lotteries, applications or release dates.

Skip: regular worship services, Bible studies, small groups, routine ministry or classes; concerts,
nightlife and generic ticket sales; ordinary restaurant reservations; undated or "ongoing" listings.

Accuracy rules — these matter more than coverage:
- Never infer, estimate or carry forward dates, times, prices, ages or URLs. If the page does not
  state it explicitly for this occurrence, use null.
- Do not resolve relative phrases ("first Tuesday of October", "this Saturday") into dates; leave the
  date null and put the phrase in action_note.
- For every non-null date or time field, add an evidence entry quoting the exact page text.
- Prefer one record per specific day or performance over one record spanning weeks.
- Use kind "signup_alert" for records whose main value is a reservation/registration/ticket/lottery
  window; otherwise put the action dates on the event itself.`;

export function createClaudeExtractor(client = new Anthropic()): Extractor {
  return async ({ source, text, today }) => {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Today is ${today} (America/Chicago).
Source: ${source.name} (${source.url})
Source kind: ${source.is_national ? "national coveted-experience source" : source.is_church ? "church / religious community institution" : "Dallas-area source"}

<page>
${text}
</page>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`Extraction refused for ${source.url}`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(`Extraction truncated for ${source.url}`);
    }
    return response.parsed_output?.events ?? [];
  };
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Anti-hallucination guard: a date/time value survives only if the model quoted page text that
 * actually appears on the page. Unsupported values are nulled, never kept.
 */
export function enforceEvidence(
  event: ExtractedEvent,
  pageText: string,
): { event: ExtractedEvent; dropped: DateField[] } {
  const page = squash(pageText);
  const supported = new Set(
    event.evidence.filter((e) => e.quote.trim().length >= 3 && page.includes(squash(e.quote))).map((e) => e.field),
  );
  const dropped: DateField[] = [];
  const out = { ...event };
  for (const f of DATE_FIELDS) {
    if (out[f] !== null && !supported.has(f)) {
      out[f] = null;
      dropped.push(f);
    }
  }
  return { event: out, dropped };
}
