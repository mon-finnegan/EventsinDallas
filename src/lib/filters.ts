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
  nationalInterests: { golf: true, major_sports: true, olympics: true, special_experiences: true },
};

export function matchesPreferences(e: CalendarEvent, p: Preferences): boolean {
  if (e.scope === "NATIONAL") {
    if (!p.national) return false;
    if (e.national_interest && !p.nationalInterests[e.national_interest]) return false;
  }
  if (e.is_church_hosted && !p.church) return false;
  if (e.subcategory === "networking" && !p.networking) return false;
  if (e.subcategory === "sports" && !p.sports) return false;
  switch (e.category) {
    case "DALLAS_EVENT":
      return p.dallas || (e.is_church_hosted && p.church);
    case "TODDLER_EVENT":
      return p.toddler || (e.is_church_hosted && p.church);
    case "SIGNUP_ALERT":
      return p.signup;
  }
}
