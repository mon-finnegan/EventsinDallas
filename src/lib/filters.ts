import { isThirtyPlusActivity } from "./relevance";
import type { CalendarEvent, NationalInterest } from "./types";

/** User preferences (spec §33). */
export interface Preferences {
  dallas: boolean;
  toddler: boolean;
  church: boolean;
  signup: boolean;
  national: boolean;
  networking: boolean;
  sports: boolean;
  thirtyPlus: boolean;
  nationalInterests: Record<NationalInterest, boolean>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  dallas: true,
  toddler: true,
  church: true,
  signup: true,
  national: true,
  networking: true,
  sports: true,
  thirtyPlus: true,
  nationalInterests: { golf: true, major_sports: true, olympics: true, special_experiences: true, exclusive_access: true },
};

export type CategoryKey = Exclude<keyof Preferences, "nationalInterests">;

/**
 * The categories an event belongs to. "dallas" is the catch-all for events that fit none of the
 * more specific ones, so a networking night or an activity for 30+ year-olds is reachable through
 * its own filter instead of hiding behind "Around Dallas".
 */
export function eventCategories(e: CalendarEvent): CategoryKey[] {
  const tags: CategoryKey[] = [];
  if (e.category === "SIGNUP_ALERT") tags.push("signup");
  if (e.scope === "NATIONAL") tags.push("national");
  if (e.subcategory === "sports") tags.push("sports");
  if (e.subcategory === "networking") tags.push("networking");
  if (e.is_church_hosted) tags.push("church");
  if (e.category === "TODDLER_EVENT" || e.is_toddler_relevant) tags.push("toddler");
  if (isThirtyPlusActivity(e)) tags.push("thirtyPlus");
  if (tags.length === 0) tags.push("dallas");
  return tags;
}

/** An event shows when any of its categories is switched on. */
export function matchesPreferences(e: CalendarEvent, p: Preferences): boolean {
  // Interests added after a viewer saved preferences are on until they turn them off.
  if (e.scope === "NATIONAL" && e.national_interest && p.nationalInterests[e.national_interest] === false) return false;
  return eventCategories(e).some((c) => p[c] !== false);
}
