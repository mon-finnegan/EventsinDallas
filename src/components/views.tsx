"use client";

import { compareBestFirst, topPick } from "@/lib/calendar";
import { addDays, formatLongDate, formatShortDate, formatTime, monthGrid, monthKey } from "@/lib/dates";
import type { CalendarEvent, CalendarItem } from "@/lib/types";
import { COLOR_CLASSES, Dot, UnknownBadge, churchTag, nationalTag } from "./ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type OnSelect = (item: CalendarItem) => void;

function groupByDate(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const list = map.get(it.date);
    if (list) list.push(it);
    else map.set(it.date, [it]);
  }
  return map;
}

function TopPickStar() {
  return (
    <span aria-label="Top pick" title="Top pick for this day" className="shrink-0 text-amber-500">
      ★
    </span>
  );
}

function ItemPill({
  item,
  onSelect,
  selected,
  pick = false,
}: {
  item: CalendarItem;
  onSelect: OnSelect;
  selected: boolean;
  pick?: boolean;
}) {
  if (item.isOngoing) {
    return (
      <button
        onClick={(ev) => {
          ev.stopPropagation();
          onSelect(item);
        }}
        title={`Ongoing: ${item.event.title}`}
        className="flex w-full items-center gap-1 truncate rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-left text-[11px] leading-tight text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_CLASSES[item.color].dot}`} />
        <span className="truncate">{item.event.title}</span>
      </button>
    );
  }
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect(item);
      }}
      title={item.label}
      className={`flex w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight ${COLOR_CLASSES[item.color].pill} ${selected ? `ring-2 ${COLOR_CLASSES[item.color].ring}` : ""}`}
    >
      {pick && <TopPickStar />}
      <span className="truncate">{item.action ? item.event.title : item.label}</span>
    </button>
  );
}

// ───────────────────────── Month ─────────────────────────

export function MonthView({
  month,
  today,
  items,
  selectedKey,
  onSelect,
  onSelectDay,
}: {
  month: string;
  today: string;
  items: CalendarItem[];
  selectedKey: string | null;
  onSelect: OnSelect;
  onSelectDay: (date: string) => void;
}) {
  const byDate = groupByDate(items);
  const weeks = monthGrid(month);
  const MAX_PILLS = 3;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date) => {
          const inMonth = monthKey(date) === month;
          const all = [...(byDate.get(date) ?? [])].sort(compareBestFirst);
          const specific = all.filter((it) => !it.isOngoing);
          // Ongoing runs fill a cell only when nothing specific is scheduled that day.
          const dayItems = specific.length ? specific : all;
          const pick = topPick(all);
          const isToday = date === today;
          const isPast = date < today;
          return (
            <div
              key={date}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(date)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onSelectDay(date)}
              aria-label={`${formatLongDate(date)}, ${dayItems.length} item${dayItems.length === 1 ? "" : "s"}`}
              className={`min-h-16 cursor-pointer border-b border-r border-zinc-100 p-1 align-top transition-colors hover:bg-zinc-50 sm:min-h-28 sm:p-1.5 dark:border-zinc-800 dark:hover:bg-zinc-900 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-zinc-50/60 dark:bg-zinc-950"} ${isPast ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : inMonth ? "" : "text-zinc-400"}`}
                >
                  {Number(date.slice(8))}
                </span>
              </div>
              {/* Phone: dots only. Larger screens: short color-coded pills, no descriptions. */}
              <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                {dayItems.slice(0, 6).map((it) => (
                  <Dot key={it.key} color={it.color} />
                ))}
              </div>
              <div className="mt-1 hidden space-y-1 sm:block">
                {dayItems.slice(0, MAX_PILLS).map((it) => (
                  <ItemPill
                    key={it.key}
                    item={it}
                    onSelect={onSelect}
                    selected={it.key === selectedKey}
                    pick={pick?.key === it.key}
                  />
                ))}
                {all.length > Math.min(dayItems.length, MAX_PILLS) && (
                  <div className="px-1 text-[11px] font-medium text-zinc-500">
                    +{all.length - Math.min(dayItems.length, MAX_PILLS)} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── Week ─────────────────────────

export function WeekView({
  weekStart,
  today,
  items,
  selectedKey,
  onSelect,
}: {
  weekStart: string;
  today: string;
  items: CalendarItem[];
  selectedKey: string | null;
  onSelect: OnSelect;
}) {
  const byDate = groupByDate(items);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((date, i) => {
        const all = byDate.get(date) ?? [];
        const dayItems = all.filter((it) => !it.isOngoing);
        const ongoing = all.filter((it) => it.isOngoing);
        const pick = topPick(all);
        return (
          <section
            key={date}
            className={`rounded-xl border p-2 ${date === today ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-800"}`}
          >
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {WEEKDAYS[i]} <span className="text-zinc-900 dark:text-zinc-100">{formatShortDate(date)}</span>
            </h3>
            <div className="space-y-1.5">
              {all.length === 0 && <p className="text-xs text-zinc-400">—</p>}
              {dayItems.map((it) => (
                <button
                  key={it.key}
                  onClick={() => onSelect(it)}
                  className={`block w-full rounded-lg border p-2 text-left text-xs ${COLOR_CLASSES[it.color].pill} ${it.key === selectedKey ? `ring-2 ${COLOR_CLASSES[it.color].ring}` : ""}`}
                >
                  <div className="flex items-center gap-1 font-semibold">
                    {pick?.key === it.key && <TopPickStar />}
                    {it.time ? formatTime(it.time) : it.action ? "Time TBA" : "Time not listed"}
                  </div>
                  <div className="mt-0.5 leading-snug">{it.label}</div>
                  {it.event.venue && !it.action && <div className="mt-0.5 truncate opacity-75">{it.event.venue}</div>}
                </button>
              ))}
              {ongoing.length > 0 && <AlsoRunning items={ongoing} onSelect={onSelect} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Compact list of confirmed daily runs, under the day's specific events. */
function AlsoRunning({ items, onSelect }: { items: CalendarItem[]; onSelect: OnSelect }) {
  return (
    <div className="pt-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Also running</div>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it) => (
          <li key={it.key}>
            <button onClick={() => onSelect(it)} className="flex items-center gap-1.5 text-left text-xs text-zinc-600 hover:underline dark:text-zinc-400">
              <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_CLASSES[it.color].dot}`} />
              {it.event.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── List ─────────────────────────

export function ListView({
  today,
  items,
  selectedKey,
  onSelect,
}: {
  today: string;
  items: CalendarItem[];
  selectedKey: string | null;
  onSelect: OnSelect;
}) {
  const upcoming = items.filter((it) => it.date >= today);
  const byDate = groupByDate(upcoming);
  if (upcoming.length === 0) return <Empty>No upcoming events match your filters.</Empty>;
  return (
    <div className="space-y-5">
      {[...byDate.entries()].map(([date, all]) => {
        const dayItems = all.filter((it) => !it.isOngoing);
        const ongoing = all.filter((it) => it.isOngoing);
        const pick = topPick(all);
        return (
        <section key={date}>
          <h3 className="sticky top-0 z-10 bg-white/90 py-1 text-xs font-bold uppercase tracking-wide text-zinc-500 backdrop-blur dark:bg-zinc-950/90">
            {date === today ? "Today" : formatLongDate(date)}
          </h3>
          {dayItems.length > 0 && (
          <ul className="mt-1 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {dayItems.map((it) => (
              <li key={it.key}>
                <button
                  onClick={() => onSelect(it)}
                  className={`flex w-full items-start gap-3 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 ${it.key === selectedKey ? "bg-zinc-50 dark:bg-zinc-900" : ""}`}
                >
                  <Dot color={it.color} className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1 font-medium leading-snug">
                      {pick?.key === it.key && <TopPickStar />}
                      {it.label}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                      <span>{it.time ? formatTime(it.time) : it.action ? "Time TBA" : "Time not listed"}</span>
                      {it.event.venue && <span>· {it.event.venue}</span>}
                      {it.event.city && !it.event.venue && <span>· {it.event.city}</span>}
                      {churchTag(it.event)}
                      {nationalTag(it.event)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          )}
          {ongoing.length > 0 && (
            <div className="mt-2 px-1">
              <AlsoRunning items={ongoing} onSelect={onSelect} />
            </div>
          )}
        </section>
        );
      })}
    </div>
  );
}

// ───────────────────────── Don't Miss ─────────────────────────

export function DontMissView({
  today,
  items,
  openNow,
  pending,
  selectedKey,
  onSelect,
  onSelectEvent,
}: {
  today: string;
  items: CalendarItem[];
  openNow: CalendarEvent[];
  pending: CalendarEvent[];
  selectedKey: string | null;
  onSelect: OnSelect;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  // Sorted exclusively by action date (spec §17).
  const actions = items.filter((it) => it.color === "red" && it.date >= today);
  const byDate = groupByDate(actions);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-red-700 dark:text-red-400">What do I need to do?</h2>
        {actions.length === 0 ? (
          <Empty>No dated actions coming up.</Empty>
        ) : (
          <div className="mt-3 space-y-4">
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date}>
                <h3 className="border-b border-red-200 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:border-red-900 dark:text-zinc-300">
                  {date === today ? "Today" : formatLongDate(date)}
                </h3>
                <ul className="mt-1">
                  {list.map((it) => (
                    <li key={it.key}>
                      <button
                        onClick={() => onSelect(it)}
                        className={`flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left hover:bg-red-50 dark:hover:bg-red-950 ${it.key === selectedKey ? "bg-red-50 dark:bg-red-950" : ""}`}
                      >
                        <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                          {it.time ? formatTime(it.time) : "Time TBA"}
                        </span>
                        <span className="text-sm font-medium">{it.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {openNow.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Open now</h2>
          <EventList events={openNow} onSelectEvent={onSelectEvent} />
        </section>
      )}

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Watching — date not yet announced</h2>
        <p className="mt-1 text-xs text-zinc-500">
          These need a signup, but the opening date hasn&apos;t been confirmed by the source. They&apos;ll move up the moment it is.
        </p>
        {pending.length === 0 ? <Empty>Nothing pending.</Empty> : <EventList events={pending} onSelectEvent={onSelectEvent} showUnknown />}
      </section>
    </div>
  );
}

function EventList({
  events,
  onSelectEvent,
  showUnknown = false,
}: {
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  showUnknown?: boolean;
}) {
  return (
    <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {events.map((e) => (
        <li key={e.id}>
          <button onClick={() => onSelectEvent(e)} className="flex w-full items-start gap-3 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <Dot color="red" className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.title}</span>
                {nationalTag(e)}
              </div>
              {e.action_note && <p className="mt-0.5 text-xs text-zinc-500">{e.action_note}</p>}
              {showUnknown && (
                <div className="mt-1">
                  <UnknownBadge />
                </div>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">{children}</p>;
}
