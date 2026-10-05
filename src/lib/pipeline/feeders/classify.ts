import type { NationalInterest, Subcategory } from "../../types";
import type { ExtractedEvent } from "../extract";
import type { Source } from "../sources";

// Deterministic classification for events that arrive as structured data (iCal, JSON-LD,
// WordPress calendars). Dates come straight from the feed; this only decides category,
// subcategory and audience flags from the text. Nothing here invents a date, time or price.

const TODDLER =
  /\b(toddlers?|tots?|babies|baby|infants?|preschool(ers)?|little ones|lap ?sit|storytime|story time|sensory|ages? (0|1|2|3)\s*[-–to]+\s*[2-6]\b|ages? [0-5]\+?|petting zoo|egg hunt|santa|trunk[- ]or[- ]treat|pumpkin patch|puppet|music (and|&) movement|kids?'? (zone|area|activities)|children'?s)\b/i;
const FAMILY = /\b(family|families|kids?|children|all ages|community|festival|parade|celebration)\b/i;
const OLDER_ONLY = /\b(teens?|ages? (1[0-8]|[6-9])\s*\+|21\+|adults? only|grades? (3|4|5|6|7|8|9|1[0-2])|middle school|high school|happy hour|wine|beer|cocktail|gala)\b/i;
const SIGNUP = /\b(registration (is )?required|register (now|here|today)|rsvp required|tickets? (required|on sale)|reservations? required|limited (space|capacity|spots))\b/i;

// Format beats theme: a "Pumpkin Storytime" is a storytime first.
const SUBCATEGORY_RULES: [RegExp, Subcategory][] = [
  [/\b(story ?time|storytelling|read(ing)? aloud)/i, "storytime"],
  [/\b(trunk[- ]or[- ]treat|halloween|costume|boo\b|spooky)/i, "halloween"],
  [/\b(christmas|santa|nativity|tree lighting|holiday lights|nutcracker|carol)/i, "christmas"],
  [/\b(easter|egg hunt)/i, "easter"],
  [/\b(pumpkin|harvest|fall fest|autumn)/i, "fall"],
  [/\b(parade)\b/i, "parade"],
  [/\b(petting zoo|animal encounter|farm animals)/i, "animals"],
  [/\b(zoo|aquarium)\b/i, "zoo"],
  [/\b(farm|hayride)/i, "farm"],
  [/\b(museum|exhibit)/i, "museum"],
  [/\b(theater|theatre|ballet|musical|puppet show)/i, "theater"],
  [/\b(concert|symphony|sing-?along|music)/i, "music"],
  [/\b(festival|fest)\b/i, "festival"],
  [/\b(golf|masters|pga|ryder cup)/i, "golf"],
  [/\b(olympic|paralympic)/i, "olympics"],
];

export function guessSubcategory(text: string, isChurch: boolean): Subcategory | null {
  for (const [re, sub] of SUBCATEGORY_RULES) if (re.test(text)) return sub;
  return isChurch ? "church_community" : null;
}

export function guessNationalInterest(text: string): NationalInterest {
  if (/\b(golf|masters|pga|u\.?s\.? open|ryder cup|the open)\b/i.test(text)) return "golf";
  if (/\b(olympic|paralympic|la28)\b/i.test(text)) return "olympics";
  if (/\b(banana ball|experience|tour)\b/i.test(text)) return "special_experiences";
  return "major_sports";
}

const SEASONAL = /\b(halloween|trunk[- ]or[- ]treat|costume|christmas|holiday|easter|thanksgiving|pumpkin|fall|autumn|spring|summer|santa|new year)/i;

export function parseAgeRange(text: string): { age_min: number | null; age_max: number | null } {
  const range = text.match(/\bages?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/i);
  if (range) return { age_min: Number(range[1]), age_max: Number(range[2]) };
  const plus = text.match(/\bages?\s*(\d{1,2})\s*\+/i);
  if (plus) return { age_min: Number(plus[1]), age_max: null };
  const under = text.match(/\b(?:ages?\s*)?(\d)\s*(?:and|&)\s*under\b/i);
  if (under) return { age_min: 0, age_max: Number(under[1]) };
  return { age_min: null, age_max: null };
}

export interface StructuredInput {
  title: string;
  description: string | null;
  event_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  cost: string | null;
  url: string | null;
  cancelled?: boolean;
}

/** Turn a structured feed record into the same shape the AI extractor produces. */
export function classifyStructured(input: StructuredInput, source: Source): ExtractedEvent & { cancelled: boolean } {
  const text = `${input.title} ${input.description ?? ""}`;
  const ages = parseAgeRange(text);
  const olderOnly = OLDER_ONLY.test(text) || (ages.age_min !== null && ages.age_min > 5);
  const toddler = !olderOnly && TODDLER.test(text);
  const family = !olderOnly && (toddler || FAMILY.test(text));

  return {
    title: cleanText(input.title),
    description: input.description ? truncate(input.description, 600) : null,
    kind: toddler ? "toddler_family_event" : "dallas_event",
    subcategory: guessSubcategory(text, source.is_church),
    national_interest: source.is_national ? guessNationalInterest(text) : null,
    event_date: input.event_date,
    end_date: input.end_date && input.end_date !== input.event_date ? input.end_date : null,
    start_time: input.start_time,
    end_time: input.end_time,
    venue: input.venue,
    address: input.address,
    city: input.city,
    state: input.state,
    age_min: ages.age_min,
    age_max: ages.age_max,
    age_label: null,
    cost: input.cost,
    activities: [],
    is_toddler_relevant: toddler,
    is_family_relevant: family,
    is_church_hosted: source.is_church,
    is_public_event: true,
    is_seasonal: SEASONAL.test(text),
    // A structured feed rarely states *when* signup opens, so mark the need and leave dates unknown.
    signup_required: false,
    signup_type: null,
    signup_open_at: null,
    signup_close_at: null,
    lottery_open_at: null,
    lottery_close_at: null,
    ticket_release_at: null,
    action_note: SIGNUP.test(text) ? "Source says registration or tickets are required." : null,
    event_url: input.url,
    registration_url: null,
    ticket_url: null,
    evidence: [],
    cancelled: Boolean(input.cancelled),
  };
}

/** Decode leftover HTML entities and strip invisible characters some feeds include. */
export function cleanText(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#?39;|&apos;/g, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  const clean = cleanText(s);
  return clean.length > n ? `${clean.slice(0, n - 1).trimEnd()}…` : clean;
}
