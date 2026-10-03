import { createHash } from "node:crypto";
import { isExpired } from "../calendar";
import { todayInDallas } from "../dates";
import { dedupe, dedupeKey } from "../dedupe";
import { assessRelevance } from "../relevance";
import type { EventRepository } from "../repository";
import type { CalendarEvent, Category } from "../types";
import { validateForPublish } from "../validation";
import { enforceEvidence, type ExtractedEvent, type Extractor } from "./extract";
import { fetchPageText } from "./fetch";
import type { Source } from "./sources";

// Daily pipeline (spec §27):
// SOURCE → FETCH → AI EXTRACTION → EVIDENCE CHECK → VALIDATION → DEDUP → RELEVANCE → DATABASE

export interface RunSummary {
  started_at: string;
  finished_at: string;
  sources_ok: number;
  sources_failed: { id: string; error: string }[];
  extracted: number;
  dropped_unsupported_fields: { title: string; fields: string[] }[];
  rejected_validation: { title: string; errors: string[] }[];
  rejected_relevance: { title: string; reasons: string[] }[];
  published: number;
  marked_completed: number;
}

const KIND_TO_CATEGORY: Record<ExtractedEvent["kind"], Category> = {
  dallas_event: "DALLAS_EVENT",
  toddler_family_event: "TODDLER_EVENT",
  signup_alert: "SIGNUP_ALERT",
};

function stableId(e: CalendarEvent): string {
  return createHash("sha1").update(dedupeKey(e)).digest("hex").slice(0, 16);
}

export function toCalendarEvent(x: ExtractedEvent, source: Source, now: string): CalendarEvent {
  const { kind, evidence: _evidence, ...rest } = x;
  void _evidence;
  const event: CalendarEvent = {
    ...rest,
    id: "",
    category: KIND_TO_CATEGORY[kind],
    scope: source.is_national ? "NATIONAL" : "DALLAS",
    national_interest: source.is_national ? x.national_interest : null,
    timezone: "America/Chicago",
    is_church_hosted: x.is_church_hosted || source.is_church,
    source_name: source.name,
    source_url: source.url,
    source_type: source.source_type,
    verification_note: null,
    status: "UPCOMING",
    last_verified_at: now,
    created_at: now,
    updated_at: now,
  };
  event.id = stableId(event);
  return event;
}

export async function runPipeline(opts: {
  sources: Source[];
  extract: Extractor;
  repo: EventRepository;
  fetchText?: (url: string) => Promise<string>;
  now?: Date;
}): Promise<RunSummary> {
  const nowDate = opts.now ?? new Date();
  const now = nowDate.toISOString();
  const today = todayInDallas(nowDate);
  const fetchText = opts.fetchText ?? fetchPageText;

  const summary: RunSummary = {
    started_at: now,
    finished_at: now,
    sources_ok: 0,
    sources_failed: [],
    extracted: 0,
    dropped_unsupported_fields: [],
    rejected_validation: [],
    rejected_relevance: [],
    published: 0,
    marked_completed: 0,
  };

  const candidates: CalendarEvent[] = [];
  for (const source of opts.sources) {
    try {
      const text = await fetchText(source.url);
      const extracted = await opts.extract({ source, text, today });
      summary.sources_ok++;
      summary.extracted += extracted.length;
      for (const raw of extracted) {
        const { event, dropped } = enforceEvidence(raw, text);
        if (dropped.length) summary.dropped_unsupported_fields.push({ title: raw.title, fields: dropped });
        candidates.push(toCalendarEvent(event, source, now));
      }
    } catch (err) {
      summary.sources_failed.push({ id: source.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const accepted: CalendarEvent[] = [];
  for (const c of candidates) {
    const v = validateForPublish(c);
    if (!v.ok) {
      summary.rejected_validation.push({ title: c.title, errors: v.errors });
      continue;
    }
    if (isExpired(v.event, today)) continue;
    const r = assessRelevance(v.event);
    if (!r.include) {
      summary.rejected_relevance.push({ title: c.title, reasons: r.reasons });
      continue;
    }
    accepted.push(v.event);
  }

  // Merge with what is already stored so repeated sightings resolve to one record (spec §30),
  // and retire events that have passed (kept for history, hidden from the calendar — spec §31).
  const existing = await opts.repo.list();
  const existingByKey = new Map(existing.map((e) => [dedupeKey(e), e]));
  const merged = dedupe([...accepted, ...existing]).map((e) => {
    // Keep the stored row's identity so a re-sighting updates it instead of inserting a twin.
    const prior = existingByKey.get(dedupeKey(e));
    return prior ? { ...e, id: prior.id, created_at: prior.created_at } : e;
  });
  const toWrite = merged.map((e) => {
    if (e.status !== "COMPLETED" && e.status !== "CANCELLED" && isExpired(e, today)) {
      summary.marked_completed++;
      return { ...e, status: "COMPLETED" as const, updated_at: now };
    }
    return e;
  });

  await opts.repo.upsert(toWrite);
  summary.published = accepted.length;
  summary.finished_at = new Date().toISOString();
  return summary;
}
