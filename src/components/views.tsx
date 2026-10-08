"use client";

import { admissionChip, compareBestFirst, topPick } from "@/lib/calendar";
import { addDays, formatLongDate, formatShortDate, formatTime, monthGrid, monthKey } from "@/lib/dates";
import type { CalendarEvent, CalendarItem } from "@/lib/types";
import { CARD, COLOR_CLASSES, Dot, UnknownBadge, churchTag, eventEmoji, nationalTag, priceTag } from "./ui";

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
    <span aria-label="Top pick" title="Top pick for this day" className="shrink-0 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]">
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
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect(item);
      }}
      title={item.label}
      className={`flex w-full items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition-colors ${COLOR_CLASSES[item.color].pill} ${selected ? `ring-2 ${COLOR_CLASSES[item.color].ring}` : ""}`}
    >
      <span aria-hidden className={`h-3 w-1 shrink-0 rounded-full ${COLOR_CLASSES[item.color].bar}`} />
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
    <div className={`overflow-hidden p-1.5 sm:p-2 ${CARD}`}>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-widest text-stone-400">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weeks.flat().map((date) => {
          const inMonth = monthKey(date) === month;
          const all = [...(byDate.get(date) ?? [])].sort(compareBestFirst);
          const dayItems = all;
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
              className={`min-h-16 cursor-pointer rounded-2xl p-1 align-top transition-all hover:bg-white hover:shadow-md sm:min-h-32 sm:p-1.5 dark:hover:bg-white/10 ${inMonth ? "bg-white/50 dark:bg-white/[0.03]" : "opacity-40"} ${isPast && inMonth ? "opacity-55" : ""} ${isToday ? "bg-white shadow-md ring-2 ring-violet-500/60 dark:bg-white/10" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-bold ${isToday ? "bg-gradient-to-br from-violet-500 to-rose-500 text-white shadow" : inMonth ? "" : "text-stone-400"}`}
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
                  <div className="px-1.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
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
    <div className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-4 @6xl:grid-cols-7">
      {days.map((date, i) => {
        const all = byDate.get(date) ?? [];
        const dayItems = all;
        const pick = topPick(all);
        return (
          <section key={date} className={`p-2.5 ${CARD} ${date === today ? "ring-2 ring-violet-500/60" : ""}`}>
            <h3 className="mb-2.5 flex items-baseline gap-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{WEEKDAYS[i]}</span>
              <span className={`font-display text-xl font-bold ${date === today ? "bg-gradient-to-r from-violet-500 to-rose-500 bg-clip-text text-transparent" : ""}`}>
                {Number(date.slice(8))}
              </span>
            </h3>
            <div className="space-y-1.5">
              {all.length === 0 && <p className="px-1 text-xs text-stone-400">Nothing yet</p>}
              {dayItems.map((it) => (
                <button
                  key={it.key}
                  onClick={() => onSelect(it)}
                  className={`block w-full rounded-2xl p-2.5 text-left text-xs transition-all hover:-translate-y-0.5 ${COLOR_CLASSES[it.color].pill} ${it.key === selectedKey ? `ring-2 ${COLOR_CLASSES[it.color].ring}` : ""}`}
                >
                  <div className="flex items-center gap-1 font-semibold opacity-80">
                    <span aria-hidden>{eventEmoji(it.event, it.color)}</span>
                    {pick?.key === it.key && <TopPickStar />}
                    {it.time ? formatTime(it.time) : it.action ? "Time TBA" : "Time not listed"}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold leading-snug">{it.label}</div>
                  {it.event.venue && !it.action && <div className="mt-0.5 truncate opacity-75">{it.event.venue}</div>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
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
        const dayItems = all;
        const pick = topPick(all);
        return (
        <section key={date}>
          <h3 className="sticky top-0 z-10 -mx-1 flex items-baseline gap-2 bg-background/80 px-1 py-2 backdrop-blur-md">
            <span className="font-display text-lg font-bold">{date === today ? "Today" : formatLongDate(date).split(",")[0]}</span>
            <span className="text-sm text-stone-500 dark:text-stone-400">{formatShortDate(date)}</span>
          </h3>
          {dayItems.length > 0 && (
          <ul className="mt-1 grid gap-2.5 @xl:grid-cols-2 @5xl:grid-cols-3">
            {dayItems.map((it) => (
              <li key={it.key}>
                <button
                  onClick={() => onSelect(it)}
                  className={`flex h-full w-full items-start gap-3 p-3 text-left transition-all hover:-translate-y-0.5 ${CARD} ${it.key === selectedKey ? `ring-2 ${COLOR_CLASSES[it.color].ring}` : ""}`}
                >
                  <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl shadow-sm ${COLOR_CLASSES[it.color].cover}`}>
                    {eventEmoji(it.event, it.color)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1 font-semibold leading-snug">
                      {pick?.key === it.key && <TopPickStar />}
                      {it.label}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                      <span>{it.time ? formatTime(it.time) : it.action ? "Time TBA" : "Time not listed"}</span>
                      {it.event.venue && <span>· {it.event.venue}</span>}
                      {it.event.city && !it.event.venue && <span>· {it.event.city}</span>}
                      {priceTag(admissionChip(it.event.cost))}
                      {churchTag(it.event)}
                      {nationalTag(it.event)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
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
        <h2 className="font-display text-3xl font-bold tracking-tight">
          What do I need to{" "}
          <span className="bg-gradient-to-r from-rose-500 to-orange-400 bg-clip-text text-transparent">do?</span>
        </h2>
        {actions.length === 0 ? (
          <Empty>No dated actions coming up.</Empty>
        ) : (
          <div className="mt-3 space-y-4">
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date}>
                <h3 className="px-1 pb-1.5 text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                  {date === today ? "Today" : formatLongDate(date)}
                </h3>
                <ul className={`p-1.5 ${CARD}`}>
                  {list.map((it) => (
                    <li key={it.key}>
                      <button
                        onClick={() => onSelect(it)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-rose-500/5 ${it.key === selectedKey ? "bg-rose-500/10" : ""}`}
                      >
                        <span className="w-20 shrink-0 rounded-full bg-rose-500/10 px-2 py-1 text-center text-xs font-bold tabular-nums text-rose-700 dark:text-rose-200">
                          {it.time ? formatTime(it.time) : "Time TBA"}
                        </span>
                        <span className="text-sm font-semibold">{it.label}</span>
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
          <h2 className="font-display text-xl font-bold tracking-tight">Open now</h2>
          <EventList events={openNow} onSelectEvent={onSelectEvent} />
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">Watching — date not yet announced</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
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
    <ul className={`mt-3 divide-y divide-stone-900/5 overflow-hidden dark:divide-white/5 ${CARD}`}>
      {events.map((e) => (
        <li key={e.id}>
          <button onClick={() => onSelectEvent(e)} className="flex w-full items-start gap-3 p-3.5 text-left hover:bg-white/60 dark:hover:bg-white/5">
            <Dot color="red" className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{e.title}</span>
                {nationalTag(e)}
              </div>
              {e.action_note && <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{e.action_note}</p>}
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
  return (
    <p className="mt-3 rounded-3xl border border-dashed border-stone-900/15 bg-white/40 p-8 text-center text-sm text-stone-500 dark:border-white/15 dark:bg-white/[0.02]">
      {children}
    </p>
  );
}
