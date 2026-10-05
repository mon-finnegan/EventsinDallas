import { addDays, splitActionAt } from "./dates";
import { assessRelevance } from "./relevance";
import type { ActionKind, CalendarEvent, CalendarItem, ItemColor, SignupType } from "./types";

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
 * Expand events into calendar items. Every event appears once:
 *  - single-day events on their date;
 *  - multi-day events and long runs on their first day only ("First day: …"); the range,
 *    daily hours and closures live in the details panel;
 *  - one red item per confirmed action date (the reverse calendar).
 * SIGNUP_ALERT records themselves only appear via their action dates.
 */
export function buildCalendarItems(events: CalendarEvent[]): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const event of events) {
    if (event.status === "CANCELLED") continue;
    const score = assessRelevance(event).score;

    if (event.event_date && event.category !== "SIGNUP_ALERT") {
      const multiDay = Boolean(event.end_date && event.end_date !== event.event_date);
      items.push({
        key: `${event.id}:event`,
        date: event.event_date,
        time: event.start_time,
        color: eventColor(event),
        label: multiDay ? `First day: ${event.title}` : event.title,
        event,
        action: null,
        isOpeningDay: multiDay,
        otherDates: [],
        score,
      });
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
        otherDates: [],
        score,
      });
    }
  }

  return items.sort(compareItems);
}

/** Events that are separate games, not repeats, even when the title matches (e.g. same opponent). */
const NEVER_COLLAPSE = new Set(["sports"]);

function seriesKey(item: CalendarItem): string {
  const e = item.event;
  const title = e.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${title}|${(e.venue ?? e.city ?? "").toLowerCase()}`;
}

/**
 * Omit repeats: when the same event is listed on several dates, keep a single entry — the next
 * upcoming date (or the first date, if all have passed) — and record the other dates on it.
 * Action items (red) are never collapsed.
 */
export function collapseRepeats(items: CalendarItem[], today: string): CalendarItem[] {
  const groups = new Map<string, CalendarItem[]>();
  const out: CalendarItem[] = [];
  for (const it of items) {
    if (it.action || NEVER_COLLAPSE.has(it.event.subcategory ?? "")) {
      out.push(it);
      continue;
    }
    const key = seriesKey(it);
    const list = groups.get(key);
    if (list) list.push(it);
    else groups.set(key, [it]);
  }
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const shown = list.find((i) => i.date >= today) ?? list[0];
    out.push({ ...shown, otherDates: list.filter((i) => i !== shown).map((i) => i.date) });
  }
  return out.sort(compareItems);
}

/** Best-first ordering for a single day: actions, then events by score. Used in month cells. */
export function compareBestFirst(a: CalendarItem, b: CalendarItem): number {
  if ((a.color === "red") !== (b.color === "red")) return a.color === "red" ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  return compareItems(a, b);
}

/** The single best non-action item for a day ("Top pick"). */
export function topPick(dayItems: CalendarItem[]): CalendarItem | null {
  const candidates = dayItems.filter((i) => i.color !== "red");
  if (candidates.length < 2) return null;
  return [...candidates].sort(compareBestFirst)[0];
}

/** Days in [from, to] with nothing starting or scheduled — the rolling coverage check. */
export function emptyDays(items: CalendarItem[], from: string, to: string): string[] {
  const have = new Set(items.map((i) => i.date));
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
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
