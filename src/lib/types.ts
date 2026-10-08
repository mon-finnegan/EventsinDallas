// Core domain types for the Dallas Family Calendar (spec §11, §18, §19, §31).

export const CATEGORIES = ["DALLAS_EVENT", "TODDLER_EVENT", "SIGNUP_ALERT"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SUBCATEGORIES = [
  "festival",
  "parade",
  "seasonal",
  "holiday",
  "church_community",
  "community",
  "sports",
  "golf",
  "museum",
  "zoo",
  "animals",
  "farm",
  "storytime",
  "music",
  "theater",
  "easter",
  "halloween",
  "fall",
  "christmas",
  "spring",
  "summer",
  "reservation",
  "registration",
  "lottery",
  "ticket_release",
  "application",
  "olympics",
  "special_experience",
  "networking",
  "food_drink",
] as const;
export type Subcategory = (typeof SUBCATEGORIES)[number];

export const SIGNUP_TYPES = [
  "RESERVATION",
  "REGISTRATION",
  "TICKET_RELEASE",
  "LOTTERY",
  "APPLICATION",
  "LIMITED_REGISTRATION",
  "OTHER",
] as const;
export type SignupType = (typeof SIGNUP_TYPES)[number];

export const STATUSES = [
  "UPCOMING",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "SOLD_OUT",
  "CANCELLED",
  "COMPLETED",
  "UNKNOWN",
] as const;
export type EventStatus = (typeof STATUSES)[number];

export const SOURCE_TYPES = [
  "official_event",
  "official_venue",
  "official_organization",
  "official_municipal",
  "official_ticketing",
  "local_calendar",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** exclusive_access: selectively opened places and moments (White House tours, ticket lotteries for landmark events). */
export const NATIONAL_INTERESTS = ["golf", "major_sports", "olympics", "special_experiences", "exclusive_access"] as const;
export type NationalInterest = (typeof NATIONAL_INTERESTS)[number];

export type Scope = "DALLAS" | "NATIONAL";

/**
 * Date fields follow one rule: a value is either verified or null. Never guessed (spec §12).
 *
 * - `event_date` / `end_date`: local calendar dates, "YYYY-MM-DD" (America/Chicago for Dallas).
 * - `start_time` / `end_time`: local "HH:MM" (24h).
 * - Action timestamps (`signup_open_at` etc.): either a full ISO datetime with offset
 *   ("2026-10-15T10:00:00-05:00") when the time is confirmed, or a bare "YYYY-MM-DD"
 *   when only the day is confirmed.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  subcategory: Subcategory | null;
  scope: Scope;
  national_interest: NationalInterest | null;

  event_date: string | null;
  end_date: string | null;
  /**
   * True only when the source confirms the run is open every day between event_date and
   * end_date (minus closed_dates). Shown in the event details; the calendar itself lists a
   * run once, on its first day.
   */
  open_daily: boolean;
  /** Days inside the run when it is confirmed closed. */
  closed_dates: string[];
  start_time: string | null;
  end_time: string | null;
  timezone: string;

  venue: string | null;
  address: string | null;
  city: string | null;
  state: string | null;

  age_min: number | null;
  age_max: number | null;
  age_label: string | null;
  cost: string | null;
  activities: string[];

  is_toddler_relevant: boolean;
  is_family_relevant: boolean;
  is_church_hosted: boolean;
  is_public_event: boolean;
  is_seasonal: boolean;

  signup_required: boolean;
  signup_type: SignupType | null;
  signup_open_at: string | null;
  signup_close_at: string | null;
  lottery_open_at: string | null;
  lottery_close_at: string | null;
  ticket_release_at: string | null;
  action_note: string | null;

  event_url: string | null;
  registration_url: string | null;
  ticket_url: string | null;

  source_name: string;
  source_url: string;
  source_type: SourceType;
  verification_note: string | null;

  /** Venue reputation from a review platform (e.g. Google). Only set from a verified lookup. */
  review_rating: number | null;
  review_count: number | null;
  review_source: string | null;
  review_url: string | null;

  status: EventStatus;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
}

/** The three colors on the calendar. */
export type ItemColor = "blue" | "green" | "red";

export type ActionKind =
  | "signup_open"
  | "signup_close"
  | "lottery_open"
  | "lottery_close"
  | "ticket_release";

/** One dot on the calendar: either an event occurrence or a derived action (reverse calendar, spec §10). */
export interface CalendarItem {
  key: string;
  date: string; // YYYY-MM-DD local
  time: string | null; // HH:MM local, null when unknown
  color: ItemColor;
  label: string;
  event: CalendarEvent;
  action: ActionKind | null;
  /** True when this is the first day of a multi-day event; later days are not listed. */
  isOpeningDay: boolean;
  /**
   * When the same event is listed on several dates (weekly storytime, a run of performances),
   * the calendar shows one occurrence and keeps the others here for the details panel.
   */
  otherDates: string[];
  /** Internal relevance score — orders each day best-first. Never shown. */
  score: number;
}
