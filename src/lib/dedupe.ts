import type { CalendarEvent, SourceType } from "./types";

// Lower is better (spec §26 source hierarchy).
const SOURCE_RANK: Record<SourceType, number> = {
  official_event: 0,
  official_venue: 1,
  official_organization: 2,
  official_municipal: 3,
  official_ticketing: 4,
  local_calendar: 5,
};

const STOPWORDS = new Set(["the", "a", "an", "annual", "of", "at", "and", "&", "presented", "by"]);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(19|20)\d{2}\b/g, " ") // drop years
    .replace(/\b\d+(st|nd|rd|th)\b/g, " ") // drop "27th annual"
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ");
}

function normalizePlace(s: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Dedup key: normalized title + event date + venue/location (spec §30). */
export function dedupeKey(e: CalendarEvent): string {
  const place = normalizePlace(e.venue) || normalizePlace(e.city) || e.scope;
  return [normalizeTitle(e.title), e.event_date ?? "nodate", place].join("|");
}

/** Prefer the more official source; tie-break on most recently verified. */
export function preferred(a: CalendarEvent, b: CalendarEvent): CalendarEvent {
  const ra = SOURCE_RANK[a.source_type];
  const rb = SOURCE_RANK[b.source_type];
  if (ra !== rb) return ra < rb ? a : b;
  return a.last_verified_at >= b.last_verified_at ? a : b;
}

/**
 * Merge a duplicate into the winner: keep the winner's values but fill any field it left null
 * from the other record. Filling nulls never invents data — the other record verified it.
 */
function merge(winner: CalendarEvent, other: CalendarEvent): CalendarEvent {
  const out = { ...winner } as Record<string, unknown>;
  const o = other as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (v === null && o[k] !== null && o[k] !== undefined) out[k] = o[k];
  }
  if (winner.activities.length === 0 && other.activities.length > 0) out.activities = other.activities;
  return out as unknown as CalendarEvent;
}

const tokens = (s: string) => new Set(normalizeTitle(s).split(" ").filter((w) => w.length > 2));

/**
 * Two listings of the same day that name the same thing: one title contains the other
 * ("Fall Fest" ⊂ "First Baptist Dallas Fall Fest"), or they share most of their words.
 */
export function sameEvent(a: CalendarEvent, b: CalendarEvent): boolean {
  if (!a.event_date || a.event_date !== b.event_date) return false;
  const na = normalizeTitle(a.title);
  const nb = normalizeTitle(b.title);
  if (!na || !nb) return false;
  const placeA = normalizePlace(a.venue ?? a.city);
  const placeB = normalizePlace(b.venue ?? b.city);
  const samePlace = !placeA || !placeB || placeA.includes(placeB) || placeB.includes(placeA) || sharedRatio(tokens(placeA), tokens(placeB)) >= 0.5;
  const contained = (na.length >= 6 && nb.includes(na)) || (nb.length >= 6 && na.includes(nb));
  const ta = tokens(a.title);
  const tb = tokens(b.title);
  const overlap = Math.min(ta.size, tb.size) >= 2 && sharedRatio(ta, tb) >= 0.75;
  return samePlace && (contained || overlap);
}

function sharedRatio(x: Set<string>, y: Set<string>): number {
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
}

export function dedupe(events: CalendarEvent[]): CalendarEvent[] {
  const exact = dedupeExact(events);
  // Fuzzy pass within each day.
  const byDay = new Map<string, CalendarEvent[]>();
  const out: CalendarEvent[] = [];
  for (const e of exact) {
    if (!e.event_date) {
      out.push(e);
      continue;
    }
    const list = byDay.get(e.event_date) ?? [];
    const match = list.findIndex((x) => sameEvent(x, e));
    if (match >= 0) {
      const win = preferred(list[match], e);
      list[match] = merge(win, win === list[match] ? e : list[match]);
    } else {
      list.push(e);
    }
    byDay.set(e.event_date, list);
  }
  for (const list of byDay.values()) out.push(...list);
  return out;
}

function dedupeExact(events: CalendarEvent[]): CalendarEvent[] {
  const byKey = new Map<string, CalendarEvent>();
  for (const e of events) {
    const key = dedupeKey(e);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, e);
      continue;
    }
    const win = preferred(existing, e);
    byKey.set(key, merge(win, win === existing ? e : existing));
  }
  return [...byKey.values()];
}
