"use client";

import { actionDates, actionLabel, eventColor } from "@/lib/calendar";
import { formatLongDate, formatShortDate, formatTime, splitActionAt } from "@/lib/dates";
import type { CalendarEvent, CalendarItem } from "@/lib/types";
import { COLOR_CLASSES, COLOR_LABEL, ConfirmedBadge, Dot, UnknownBadge, churchTag, nationalTag } from "./ui";

export type Selection = { kind: "item"; item: CalendarItem } | { kind: "event"; event: CalendarEvent };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function eventDateText(e: CalendarEvent): React.ReactNode {
  if (!e.event_date) return <UnknownBadge />;
  if (e.end_date && e.end_date !== e.event_date) {
    return `${formatShortDate(e.event_date)} – ${formatShortDate(e.end_date)}, ${e.end_date.slice(0, 4)}`;
  }
  return formatLongDate(e.event_date);
}

function timeText(e: CalendarEvent): string | null {
  if (!e.start_time) return null;
  return e.end_time ? `${formatTime(e.start_time)} – ${formatTime(e.end_time)}` : formatTime(e.start_time);
}

function ageText(e: CalendarEvent): string | null {
  if (e.age_label) return e.age_label;
  if (e.age_min !== null && e.age_max !== null) return `Ages ${e.age_min}–${e.age_max}`;
  if (e.age_min !== null) return `Ages ${e.age_min}+`;
  if (e.age_max !== null) return `Up to age ${e.age_max}`;
  return null;
}

function actionButtonLabel(e: CalendarEvent): string {
  switch (e.signup_type) {
    case "RESERVATION":
      return "Reserve";
    case "TICKET_RELEASE":
      return "Get tickets";
    case "LOTTERY":
      return "Enter lottery";
    case "APPLICATION":
      return "Apply";
    default:
      return "Register";
  }
}

const btn =
  "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2";

export function DetailPanel({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const item = selection.kind === "item" ? selection.item : null;
  const e = selection.kind === "item" ? selection.item.event : selection.event;
  const isAction = Boolean(item?.action) || e.category === "SIGNUP_ALERT";
  const color = item?.color ?? eventColor(e);

  const title = item?.action ? `${actionLabel(e, item.action)}` : e.title;
  const location = [e.venue, e.address ?? (e.city ? `${e.city}${e.state ? `, ${e.state}` : ""}` : null)]
    .filter(Boolean)
    .join(" · ");
  const signupUrl = e.registration_url ?? e.ticket_url;
  const actions = actionDates(e);

  return (
    <aside
      aria-label="Event details"
      className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${COLOR_CLASSES[color].text}`}>
            <Dot color={color} />
            {isAction ? "Don't miss" : COLOR_LABEL[color]}
          </div>
          <h2 className="mt-1 text-lg font-bold leading-snug">{title}</h2>
          {item?.action && <p className="text-sm text-zinc-600 dark:text-zinc-400">{e.title}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {churchTag(e)}
            {nationalTag(e)}
            {e.status === "REGISTRATION_OPEN" && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Open now</span>
            )}
            {e.status === "SOLD_OUT" && (
              <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[11px] font-bold text-white">Sold out</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="Close details"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {item?.action && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <div className="text-sm font-semibold text-red-900 dark:text-red-100">{formatLongDate(item.date)}</div>
            <div className="text-sm text-red-800 dark:text-red-200">
              {item.time ? formatTime(item.time) : "Time not yet announced"}
            </div>
          </div>
        )}

        <dl className="space-y-3">
          <Row label={isAction ? "Event date" : "Date"}>
            <div className="flex flex-wrap items-center gap-2">
              {eventDateText(e)}
              {e.event_date && <ConfirmedBadge />}
            </div>
          </Row>
          {timeText(e) && <Row label="Time">{timeText(e)}</Row>}
          {location && <Row label="Location">{location}</Row>}
          {e.description && <Row label="About">{e.description}</Row>}
          {e.activities.length > 0 && (
            <Row label="Activities">
              <ul className="list-disc space-y-0.5 pl-5">
                {e.activities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Row>
          )}
          {ageText(e) && <Row label="Age">{ageText(e)}</Row>}
          {e.cost && <Row label="Cost">{e.cost}</Row>}

          {e.signup_required && (
            <Row label="Action">
              <div className="space-y-1.5">
                {actions.length === 0 ? (
                  <UnknownBadge>Signup date not yet announced</UnknownBadge>
                ) : (
                  actions.map(({ kind, at }) => {
                    const { date, time } = splitActionAt(at, e.timezone);
                    return (
                      <div key={kind} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{actionLabel(e, kind)}:</span>
                        <span>
                          {formatLongDate(date)}
                          {time ? ` · ${formatTime(time)}` : ""}
                        </span>
                        {!time && <UnknownBadge>Time TBA</UnknownBadge>}
                      </div>
                    );
                  })
                )}
                {e.action_note && <p className="text-zinc-600 dark:text-zinc-400">{e.action_note}</p>}
              </div>
            </Row>
          )}
        </dl>

        <div className="flex flex-wrap gap-2 pt-1">
          {signupUrl && (
            <a
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400`}
            >
              {actionButtonLabel(e)}
            </a>
          )}
          {e.event_url && (
            <a
              href={e.event_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} bg-zinc-900 text-white hover:bg-zinc-700 focus-visible:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white`}
            >
              Official website
            </a>
          )}
        </div>

        <div className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
          <p>
            Source:{" "}
            <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
              {e.source_name}
            </a>
          </p>
          <p>Last verified {new Date(e.last_verified_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          {e.verification_note && <p className="mt-1 italic">{e.verification_note}</p>}
        </div>
      </div>
    </aside>
  );
}
