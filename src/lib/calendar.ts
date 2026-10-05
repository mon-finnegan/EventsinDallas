import { addDays, daysBetween, splitActionAt } from "./dates";
import { assessRelevance } from "./relevance";
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
    const score = assessRelevance(event).score;

    if (event.event_date && event.category !== "SIGNUP_ALERT") {
      const color = eventColor(event);
      const end = event.end_date ?? event.event_date;
      const span = daysBetween(event.event_date, end) + 1;
      const longRun = span > MAX_DAILY_SPAN_DAYS;
      const closed = new Set(event.closed_dates);
      // Short events appear every day. Long runs appear on their first day, and — only when the
      // source confirms they are open daily — as quiet "ongoing" entries on the following days.
      const days =
        !longRun || event.open_daily
          ? Array.from({ length: span }, (_, i) => addDays(event.event_date!, i))
          : [event.event_date];
      for (const date of days) {
        if (closed.has(date)) continue;
        const first = date === event.event_date;
        items.push({
          key: `${event.id}:event:${date}`,
          date,
          time: first ? event.start_time : null,
          color,
          label: longRun && first ? `First day: ${event.title}` : event.title,
          event,
          action: null,
          isOpeningDay: longRun && first,
          isOngoing: longRun && !first,
          score,
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
        isOngoing: false,
        score,
      });
    }
  }

  return items.sort(compareItems);
}

/**
 * Best-first ordering for a single day: actions, then specific events by score, then ongoing
 * runs. Used where space is tight (month cells).
 */
export function compareBestFirst(a: CalendarItem, b: CalendarItem): number {
  if ((a.color === "red") !== (b.color === "red")) return a.color === "red" ? -1 : 1;
  if (a.isOngoing !== b.isOngoing) return a.isOngoing ? 1 : -1;
  if (a.score !== b.score) return b.score - a.score;
  return compareItems(a, b);
}

/** The single best non-action, non-ongoing item for a day ("Top pick"). */
export function topPick(dayItems: CalendarItem[]): CalendarItem | null {
  const candidates = dayItems.filter((i) => i.color !== "red" && !i.isOngoing);
  if (candidates.length < 2) return null;
  return [...candidates].sort(compareBestFirst)[0];
}

/** Days in [from, to] with no specific (non-ongoing) item — the rolling coverage check. */
export function emptyDays(items: CalendarItem[], from: string, to: string): string[] {
  const have = new Set(items.filter((i) => !i.isOngoing).map((i) => i.date));
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
}

export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Red (action) items first within a day, then by time (unknown times last).
  if ((a.color === "red") !== (b.color === "red")) return a.color === "red" ? -1 : 1;
  if (a.isOngoing !== b.isOngoing) return a.isOngoing ? 1 : -1;
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
