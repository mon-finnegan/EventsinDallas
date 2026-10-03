import { z } from "zod";
import {
  CATEGORIES,
  NATIONAL_INTERESTS,
  SIGNUP_TYPES,
  SOURCE_TYPES,
  STATUSES,
  SUBCATEGORIES,
  type CalendarEvent,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Date-only, or ISO datetime with an explicit offset / Z so the time is unambiguous.
const ACTION_RE = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?(Z|[+-]\d{2}:\d{2}))?$/;

const isRealDate = (s: string) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10);
};

const date = z.string().regex(DATE_RE).refine(isRealDate, "invalid calendar date").nullable();
const time = z.string().regex(TIME_RE).nullable();
const actionAt = z.string().regex(ACTION_RE).refine(isRealDate, "invalid calendar date").nullable();
const url = z.url({ protocol: /^https?$/ });

export const CalendarEventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(3),
    description: z.string().nullable(),
    category: z.enum(CATEGORIES),
    subcategory: z.enum(SUBCATEGORIES).nullable(),
    scope: z.enum(["DALLAS", "NATIONAL"]),
    national_interest: z.enum(NATIONAL_INTERESTS).nullable(),

    event_date: date,
    end_date: date,
    start_time: time,
    end_time: time,
    timezone: z.string().min(1),

    venue: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),

    age_min: z.number().int().min(0).max(18).nullable(),
    age_max: z.number().int().min(0).max(99).nullable(),
    age_label: z.string().nullable(),
    cost: z.string().nullable(),
    activities: z.array(z.string()),

    is_toddler_relevant: z.boolean(),
    is_family_relevant: z.boolean(),
    is_church_hosted: z.boolean(),
    is_public_event: z.boolean(),
    is_seasonal: z.boolean(),

    signup_required: z.boolean(),
    signup_type: z.enum(SIGNUP_TYPES).nullable(),
    signup_open_at: actionAt,
    signup_close_at: actionAt,
    lottery_open_at: actionAt,
    lottery_close_at: actionAt,
    ticket_release_at: actionAt,
    action_note: z.string().nullable(),

    event_url: url.nullable(),
    registration_url: url.nullable(),
    ticket_url: url.nullable(),

    source_name: z.string().min(1),
    source_url: url,
    source_type: z.enum(SOURCE_TYPES),
    verification_note: z.string().nullable(),

    review_rating: z.number().min(0).max(5).nullable(),
    review_count: z.number().int().min(0).nullable(),
    review_source: z.string().nullable(),
    review_url: url.nullable(),

    status: z.enum(STATUSES),
    last_verified_at: z.iso.datetime({ offset: true }),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ValidationResult =
  | { ok: true; event: CalendarEvent }
  | { ok: false; errors: string[] };

/**
 * Publishing gate (spec §29). Shape validation plus the business rules that decide whether
 * a record may become visible on the calendar.
 */
export function validateForPublish(input: unknown): ValidationResult {
  const parsed = CalendarEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const e = parsed.data as CalendarEvent;
  const errors: string[] = [];

  const hasAnyActionDate = [
    e.signup_open_at,
    e.signup_close_at,
    e.lottery_open_at,
    e.lottery_close_at,
    e.ticket_release_at,
  ].some(Boolean);

  // A specific date (or verified range) is required, except for national signup alerts whose
  // value is the action window itself.
  if (!e.event_date && !(e.category === "SIGNUP_ALERT" && (hasAnyActionDate || e.signup_required))) {
    errors.push("event_date: a specific verified date is required");
  }
  if (e.end_date && !e.event_date) errors.push("end_date: set without event_date");
  if (e.event_date && e.end_date && e.end_date < e.event_date) {
    errors.push("end_date: before event_date");
  }
  if (e.age_min !== null && e.age_max !== null && e.age_max < e.age_min) {
    errors.push("age_max: below age_min");
  }

  // Geography: Dallas items need a location; national items need a declared interest.
  if (e.scope === "DALLAS" && !e.city) errors.push("city: required for Dallas-scope events");
  if (e.scope === "NATIONAL" && !e.national_interest) {
    errors.push("national_interest: required for national-scope items");
  }

  // Signup alerts must carry a confirmed action type; dates may be explicitly unknown (null).
  if (e.category === "SIGNUP_ALERT" && !e.signup_type) {
    errors.push("signup_type: required for SIGNUP_ALERT");
  }
  if (hasAnyActionDate && !e.signup_type) {
    errors.push("signup_type: action dates present without an action type");
  }
  if (e.signup_type && !e.signup_required) {
    errors.push("signup_required: must be true when signup_type is set");
  }

  if ((e.review_rating === null) !== (e.review_count === null) || (e.review_count !== null && !e.review_source)) {
    errors.push("review_*: rating, count and source must be set together");
  }

  // Church events must be public-facing (spec §6).
  if (e.is_church_hosted && !e.is_public_event) {
    errors.push("is_public_event: church-hosted events must be open to the public");
  }

  return errors.length ? { ok: false, errors } : { ok: true, event: e };
}
