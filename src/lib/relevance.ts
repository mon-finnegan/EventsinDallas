import type { CalendarEvent } from "./types";

// Internal relevance assessment (spec §23). Never shown to the user — it only decides
// whether an event belongs on the calendar.

/** Default neighborhoods / cities (spec §22). */
export const CORE_CITIES = [
  "dallas",
  "addison",
  "richardson",
  "plano",
  "irving",
  "carrollton",
  "university park",
  "highland park",
];

/** Within ~30 miles of Dallas; allowed when the event is significant enough. */
export const METRO_CITIES = [
  "fort worth",
  "arlington",
  "grand prairie",
  "garland",
  "mesquite",
  "frisco",
  "mckinney",
  "allen",
  "lewisville",
  "flower mound",
  "coppell",
  "grapevine",
  "farmers branch",
  "rowlett",
  "rockwall",
  "duncanville",
  "desoto",
  "cedar hill",
  "lancaster",
  "the colony",
  "highland village",
  "sachse",
  "wylie",
];

/** Ordinary church programming that must never appear (spec §6). */
const CHURCH_EXCLUDE =
  /\b(sunday service|worship service|bible study|prayer (group|meeting)|small group|sermon|mass schedule|ministry meeting|vbs registration|confirmation class|catechism|youth group meeting|choir rehearsal)\b/i;

/** Discovery signals for church/community events (spec §21). */
export const CHURCH_SIGNALS =
  /\b(festival|fall ?fest|family festival|pumpkin|trunk[- ]or[- ]treat|easter|egg hunt|christmas|tree lighting|holiday|harvest|community day|open house|food festival|cultural festival|living nativity|santa|block party)\b/i;

/** Generic concert/nightlife content is out of scope (spec §8, §35). */
const OUT_OF_SCOPE = /\b(concert tour|nightclub|bar crawl|pub crawl|happy hour|21\+|brunch reservations?)\b/i;

export interface RelevanceResult {
  include: boolean;
  score: number;
  reasons: string[];
}

export function assessRelevance(e: CalendarEvent): RelevanceResult {
  const reasons: string[] = [];
  const text = `${e.title} ${e.description ?? ""}`;
  let score = 0;

  if (OUT_OF_SCOPE.test(text)) return { include: false, score: 0, reasons: ["out of scope"] };

  if (e.is_church_hosted) {
    if (CHURCH_EXCLUDE.test(text)) {
      return { include: false, score: 0, reasons: ["ordinary church programming"] };
    }
    if (!e.is_public_event) return { include: false, score: 0, reasons: ["not public"] };
    if (CHURCH_SIGNALS.test(text) || e.activities.length >= 3) {
      score += 2;
      reasons.push("community-facing church event");
    }
  }

  // Geography
  const city = (e.city ?? "").toLowerCase();
  if (e.scope === "NATIONAL") {
    score += 1;
  } else if (CORE_CITIES.includes(city)) {
    score += 2;
    reasons.push("core Dallas area");
  } else if (METRO_CITIES.includes(city)) {
    score += 0.5;
    reasons.push("DFW metro");
  } else {
    score -= 2;
    reasons.push("outside default radius");
  }

  // Family / toddler fit (primary audience is 1–3)
  if (e.is_toddler_relevant) {
    score += 2;
    reasons.push("toddler relevant");
  } else if (e.is_family_relevant) {
    score += 1;
  }
  if (e.age_min !== null && e.age_min > 5) {
    score -= 3;
    reasons.push("designed for older children");
  }

  // Specificity (spec §25)
  if (e.event_date) {
    score += 1;
    if (e.start_time) score += 0.5;
    if (e.end_date) {
      const span =
        (Date.parse(`${e.end_date}T00:00:00Z`) - Date.parse(`${e.event_date}T00:00:00Z`)) / 86_400_000;
      if (span > 14) {
        score -= 1;
        reasons.push("long multi-week run");
      }
    }
  }

  // Scarcity / advance-planning value
  if (e.signup_required) {
    score += 1.5;
    reasons.push("requires advance action");
  }
  if (e.is_seasonal) score += 0.5;
  if (e.subcategory === "special_experience") score += 1;

  // Well-reviewed venues are tried-and-true (only when a verified review lookup exists).
  if (e.review_count !== null && e.review_rating !== null) {
    if (e.review_count >= 5000 && e.review_rating >= 4.5) {
      score += 1;
      reasons.push("highly reviewed venue");
    } else if (e.review_count >= 500 && e.review_rating >= 4.3) {
      score += 0.5;
    } else if (e.review_rating < 3.8) {
      score -= 1;
      reasons.push("poorly reviewed venue");
    }
  }

  // Source reliability
  if (e.source_type === "local_calendar") score -= 0.5;
  else score += 0.5;

  const include = score >= 3;
  return { include, score, reasons };
}

/** Spec target: roughly 5–20 genuinely useful events per week (§24). */
export const MAX_EVENTS_PER_WEEK = 20;

/**
 * Keep the calendar curated as feeders multiply: per Sunday-start week, keep the highest
 * scoring events. Signup alerts and events with action dates are never cut — missing an
 * action date is the costliest failure.
 */
export function curateByWeek(
  events: CalendarEvent[],
  score: (e: CalendarEvent) => number,
  maxPerWeek = MAX_EVENTS_PER_WEEK,
): { kept: CalendarEvent[]; cut: CalendarEvent[] } {
  const keep: CalendarEvent[] = [];
  const byWeek = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const hasAction = e.category === "SIGNUP_ALERT" || e.signup_required;
    if (hasAction || !e.event_date) {
      keep.push(e);
      continue;
    }
    const wk = weekStart(e.event_date);
    const list = byWeek.get(wk);
    if (list) list.push(e);
    else byWeek.set(wk, [e]);
  }
  const cut: CalendarEvent[] = [];
  for (const list of byWeek.values()) {
    list.sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title));
    keep.push(...list.slice(0, maxPerWeek));
    cut.push(...list.slice(maxPerWeek));
  }
  return { kept: keep, cut };
}

function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
