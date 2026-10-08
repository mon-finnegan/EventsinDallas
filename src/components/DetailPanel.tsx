"use client";

import { actionDates, actionLabel, eventColor } from "@/lib/calendar";
import { formatLongDate, formatShortDate, formatTime, splitActionAt } from "@/lib/dates";
import type { CalendarEvent, CalendarItem } from "@/lib/types";
import { COLOR_CLASSES, COLOR_LABEL, ConfirmedBadge, UnknownBadge, churchTag, eventEmoji, nationalTag } from "./ui";

export type Selection = { kind: "item"; item: CalendarItem } | { kind: "event"; event: CalendarEvent };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-stone-900/[0.03] px-3.5 py-3 dark:bg-white/[0.04]">
      <dt className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed">{children}</dd>
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
  "inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2";

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
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className={`relative shrink-0 overflow-hidden bg-gradient-to-br p-5 pb-4 text-white ${COLOR_CLASSES[color].cover}`}>
        <span aria-hidden className="pointer-events-none absolute -right-3 -top-4 text-[7rem] leading-none opacity-30">
          {eventEmoji(e, color)}
        </span>
        <div className="relative min-w-0 pr-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur">
            {isAction ? "Don't miss" : COLOR_LABEL[color]}
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight drop-shadow-sm">{title}</h2>
          {item?.action && <p className="mt-0.5 text-sm text-white/85">{e.title}</p>}
          <div className="mt-2.5 flex flex-wrap gap-1.5 [&>span]:bg-white/90">
            {churchTag(e)}
            {nationalTag(e)}
            {e.status === "REGISTRATION_OPEN" && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-rose-700">Open now</span>
            )}
            {e.status === "SOLD_OUT" && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-stone-800">Sold out</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/25 p-1.5 text-white backdrop-blur hover:bg-white/40"
          aria-label="Close details"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {item?.action && (
          <div className="rounded-2xl bg-rose-500/10 p-3.5 ring-1 ring-inset ring-rose-500/20">
            <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">{formatLongDate(item.date)}</div>
            <div className="text-sm text-rose-800 dark:text-rose-200">
              {item.time ? formatTime(item.time) : "Time not yet announced"}
            </div>
          </div>
        )}

        {item?.isOpeningDay && e.end_date && (
          <div className="rounded-2xl bg-violet-500/10 p-3.5 text-sm ring-1 ring-inset ring-violet-500/20">
            <span className="font-semibold">First day.</span> Runs {formatShortDate(e.event_date!)} – {formatLongDate(e.end_date)}
            {e.open_daily
              ? `, open daily${e.closed_dates.length ? ` except ${e.closed_dates.map(formatShortDate).join(", ")}` : ""}.`
              : ". See the details below or the source for which days it's open."}
          </div>
        )}
        {item && item.otherDates.length > 0 && (
          <div className="rounded-2xl bg-violet-500/10 p-3.5 text-sm ring-1 ring-inset ring-violet-500/20">
            <span className="font-semibold">Also on:</span> {item.otherDates.map(formatShortDate).join(", ")}
          </div>
        )}

        <dl className="space-y-2">
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
          <Row label="Admission">
            {e.cost ? (
              e.cost
            ) : (
              <span className="text-stone-500 dark:text-stone-400">Not listed by the source — check the official site before you go.</span>
            )}
          </Row>
          {e.review_rating !== null && e.review_count !== null && (
            <Row label="Venue reviews">
              <span className="font-semibold">{e.review_rating.toFixed(1)}★</span> ·{" "}
              {e.review_url ? (
                <a href={e.review_url} target="_blank" rel="noopener noreferrer" className="underline">
                  {e.review_count.toLocaleString("en-US")} {e.review_source} reviews
                </a>
              ) : (
                `${e.review_count.toLocaleString("en-US")} ${e.review_source} reviews`
              )}
            </Row>
          )}

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
                {e.action_note && <p className="text-stone-600 dark:text-stone-400">{e.action_note}</p>}
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
              className={`${btn} bg-gradient-to-r from-rose-500 to-orange-400 text-white shadow-lg shadow-rose-500/25 focus-visible:ring-rose-400`}
            >
              {actionButtonLabel(e)}
            </a>
          )}
          {e.event_url && (
            <a
              href={e.event_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} bg-stone-900 text-white hover:bg-stone-800 focus-visible:ring-stone-400 dark:bg-white dark:text-stone-900`}
            >
              Official website
            </a>
          )}
        </div>

        <div className="border-t border-stone-900/10 pt-3 text-xs text-stone-500 dark:border-white/10 dark:text-stone-400">
          <p>
            Source:{" "}
            <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800 dark:hover:text-stone-200">
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
