import { addDays, daysBetween, splitActionAt } from "./dates";
import type { ActionKind, CalendarEvent, CalendarItem, ItemColor, SignupType } from "./types";

/** Runs longer than this are shown only on their opening day (spec §25). */
export const MAX_DAILY_SPAN_DAYS = 4;

const ACTION_VERB: Record<SignupType, string> = {
  RESERVATION: "Reservations",
  REGISTRATION: "Registration",
  TICKET_RELEASE: "Tickets",
  LOTTERY: "Lottery",
  APPLICATION: "Applications",
  LIMITED_REGISTRATION: "Limited registration",
  OTHER: "Signup",
};

export function actionLabel(event: CalendarEvent, kind: ActionKind): string {
  const noun = event.signup_type ? ACTION_VERB[event.signup_type] : "Signup";
  if (event.signup_type === "OTHER" && kind === "signup_open") return "Key date";
  switch (kind) {
    case "signup_open":
      return `${noun} open`;
    case "signup_close":
      return `${noun} close`;
    case "lottery_open":
      return "Lottery opens";
    case "lottery_close":
      return "Lottery closes";
    case "ticket_release":
      return "Tickets go on sale";
  }
}

export function eventColor(event: CalendarEvent): ItemColor {
  if (event.category === "TODDLER_EVENT") return "green";
  if (event.category === "SIGNUP_ALERT") return "red";
  return "blue";
}

/** The event's last day; used to retire expired events from the active calendar (spec §31). */
export function lastDay(event: CalendarEvent): string | null {
  return event.end_date ?? event.event_date;
}

export function isExpired(event: CalendarEvent, today: string): boolean {
  if (event.status === "COMPLETED" || event.status === "CANCELLED") return true;
  const last = lastDay(event);
  if (last) return last < today;
  // No event date (e.g. national alert): expired once every known action date has passed.
  const actions = actionDates(event);
  return actions.length > 0 && actions.every((a) => splitActionAt(a.at).date < today);
}

export function actionDates(event: CalendarEvent): { kind: ActionKind; at: string }[] {
  const out: { kind: ActionKind; at: string }[] = [];
  if (event.signup_open_at) out.push({ kind: "signup_open", at: event.signup_open_at });
  if (event.signup_close_at) out.push({ kind: "signup_close", at: event.signup_close_at });
  if (event.lottery_open_at) out.push({ kind: "lottery_open", at: event.lottery_open_at });
  if (event.lottery_close_at) out.push({ kind: "lottery_close", at: event.lottery_close_at });
  if (event.ticket_release_at) out.push({ kind: "ticket_release", at: event.ticket_release_at });
  return out;
}

/**
 * Expand events into calendar items:
 *  - one blue/green item per day for short events, opening day only for long runs;
 *  - one red item per confirmed action date (the reverse calendar).
 * SIGNUP_ALERT records themselves only appear via their action dates.
 */
export function buildCalendarItems(events: CalendarEvent[]): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const event of events) {
    if (event.status === "CANCELLED") continue;

    if (event.event_date && event.category !== "SIGNUP_ALERT") {
      const color = eventColor(event);
      const end = event.end_date ?? event.event_date;
      const span = daysBetween(event.event_date, end) + 1;
      const days =
        span <= MAX_DAILY_SPAN_DAYS
          ? Array.from({ length: span }, (_, i) => addDays(event.event_date!, i))
          : [event.event_date];
      for (const date of days) {
        items.push({
          key: `${event.id}:event:${date}`,
          date,
          time: date === event.event_date ? event.start_time : null,
          color,
          label: span > MAX_DAILY_SPAN_DAYS ? `${event.title} (opens)` : event.title,
          event,
          action: null,
          isOpeningDay: span > MAX_DAILY_SPAN_DAYS,
        });
      }
    }

    for (const { kind, at } of actionDates(event)) {
      const { date, time } = splitActionAt(at, event.timezone);
      items.push({
        key: `${event.id}:${kind}`,
        date,
        time,
        color: "red",
        label: `${actionLabel(event, kind)}: ${event.title}`,
        event,
        action: kind,
        isOpeningDay: false,
      });
    }
  }

  return items.sort(compareItems);
}

export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Red (action) items first within a day, then by time (unknown times last).
  if ((a.color === "red") !== (b.color === "red")) return a.color === "red" ? -1 : 1;
  const ta = a.time ?? "99:99";
  const tb = b.time ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.label.localeCompare(b.label);
}

/**
 * Signup-required events with no confirmed action date yet: shown as "Date not yet announced".
 * Events already open are listed under "Open now" instead.
 */
export function pendingActions(events: CalendarEvent[], today: string): CalendarEvent[] {
  return events.filter(
    (e) =>
      e.signup_required &&
      e.status !== "REGISTRATION_OPEN" &&
      actionDates(e).length === 0 &&
      !isExpired(e, today),
  );
}
