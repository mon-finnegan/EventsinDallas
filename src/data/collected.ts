import { SEED_EVENTS } from "./seed";
import collected from "./collected.json";
import type { CalendarEvent } from "@/lib/types";

/**
 * Events found by the daily batch (written to collected.json by the GitHub Actions run and
 * deployed with the site). Entries override the hand-researched seed by id, so a re-verified
 * seed event carries its newer verification date.
 */
export function mergeCollected(seed: CalendarEvent[], found: CalendarEvent[]): CalendarEvent[] {
  const byId = new Map(seed.map((e) => [e.id, e]));
  for (const e of found) byId.set(e.id, e);
  return [...byId.values()];
}

export const COLLECTED_EVENTS = (collected as { events: CalendarEvent[] }).events;
export const COLLECTED_UPDATED_AT = (collected as { updated_at: string | null }).updated_at;

export function allBundledEvents(): CalendarEvent[] {
  return mergeCollected(SEED_EVENTS, COLLECTED_EVENTS);
}
