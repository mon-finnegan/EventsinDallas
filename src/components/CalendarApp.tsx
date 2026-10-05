"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCalendarItems, isExpired, pendingActions } from "@/lib/calendar";
import { addDays, addMonths, formatMonthTitle, formatShortDate, monthKey, startOfWeek } from "@/lib/dates";
import { DEFAULT_PREFERENCES, matchesPreferences, type Preferences } from "@/lib/filters";
import type { CalendarEvent, CalendarItem, NationalInterest } from "@/lib/types";
import { DetailPanel, type Selection } from "./DetailPanel";
import { COLOR_CLASSES, COLOR_LABEL, Dot } from "./ui";
import { DontMissView, ListView, MonthView, WeekView } from "./views";

type View = "month" | "week" | "list" | "dontmiss";
const VIEWS: { id: View; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "list", label: "List" },
  { id: "dontmiss", label: "Don't Miss" },
];

const PREFS_KEY = "dfc:prefs:v1";
const VIEW_KEY = "dfc:view:v1";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); preferences just won't persist.
  }
}

export function CalendarApp({ events, today }: { events: CalendarEvent[]; today: string }) {
  const [view, setView] = useState<View>("month");
  const [month, setMonth] = useState(monthKey(today));
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dayFocus, setDayFocus] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Restore per-viewer conveniences after mount (avoids hydration mismatch).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setPrefs(loadJSON(PREFS_KEY, DEFAULT_PREFERENCES));
    const v = loadJSON<{ view: View }>(VIEW_KEY, { view: "month" }).view;
    if (VIEWS.some((x) => x.id === v)) setView(v);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    saveJSON(PREFS_KEY, next);
  };
  const changeView = (v: View) => {
    setView(v);
    setDayFocus(null);
    saveJSON(VIEW_KEY, { view: v });
  };

  const visibleEvents = useMemo(
    () => events.filter((e) => !isExpired(e, today) && matchesPreferences(e, prefs)),
    [events, today, prefs],
  );
  const items = useMemo(() => {
    const all = buildCalendarItems(visibleEvents);
    return prefs.signup ? all : all.filter((it) => it.color !== "red");
  }, [visibleEvents, prefs.signup]);
  const pending = useMemo(() => (prefs.signup ? pendingActions(visibleEvents, today) : []), [visibleEvents, today, prefs.signup]);
  const openNow = useMemo(
    () => (prefs.signup ? visibleEvents.filter((e) => e.signup_required && e.status === "REGISTRATION_OPEN") : []),
    [visibleEvents, prefs.signup],
  );

  const selectedKey = selection?.kind === "item" ? selection.item.key : null;
  const selectItem = (item: CalendarItem) => setSelection({ kind: "item", item });
  const selectEvent = (event: CalendarEvent) => setSelection({ kind: "event", event });

  const dayItems = dayFocus ? items.filter((it) => it.date === dayFocus) : [];
  const counts = useMemo(() => {
    const inMonth = items.filter((it) => monthKey(it.date) === month);
    return {
      blue: inMonth.filter((i) => i.color === "blue").length,
      green: inMonth.filter((i) => i.color === "green").length,
      red: inMonth.filter((i) => i.color === "red").length,
    };
  }, [items, month]);

  const upcomingActionCount =
    items.filter((it) => it.color === "red" && it.date >= today).length + pending.length + openNow.length;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-4 lg:py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Dallas Family Calendar</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">What&apos;s worth doing — and what to sign up for before it&apos;s gone.</p>
        </div>
        <nav aria-label="Calendar views" className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => changeView(v.id)}
              aria-pressed={view === v.id}
              className={`relative rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${view === v.id ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
            >
              {v.label}
              {v.id === "dontmiss" && upcomingActionCount > 0 && (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{upcomingActionCount}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {(["blue", "green", "red"] as const).map((c) => (
          <span key={c} className={`flex items-center gap-1.5 font-medium ${COLOR_CLASSES[c].text}`}>
            <Dot color={c} /> {COLOR_LABEL[c]}
            {view === "month" && <span className="text-zinc-400">({counts[c]})</span>}
          </span>
        ))}
        <button
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          className="ml-auto rounded-md border border-zinc-300 px-2.5 py-1 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Filters
        </button>
      </div>

      {showFilters && <FilterBar prefs={prefs} onChange={updatePrefs} />}

      <div className="mt-4 flex flex-1 gap-4">
        <main className="min-w-0 flex-1">
          {(view === "month" || view === "week") && (
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => (view === "month" ? setMonth(addMonths(month, -1)) : setWeekStart(addDays(weekStart, -7)))}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                onClick={() => (view === "month" ? setMonth(addMonths(month, 1)) : setWeekStart(addDays(weekStart, 7)))}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                aria-label="Next"
              >
                ›
              </button>
              <h2 className="text-lg font-bold">
                {view === "month"
                  ? formatMonthTitle(month)
                  : `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}, ${addDays(weekStart, 6).slice(0, 4)}`}
              </h2>
              <button
                onClick={() => {
                  setMonth(monthKey(today));
                  setWeekStart(startOfWeek(today));
                }}
                className="ml-auto rounded-md px-2.5 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Today
              </button>
            </div>
          )}

          {view === "month" && (
            <MonthView
              month={month}
              today={today}
              items={items}
              selectedKey={selectedKey}
              onSelect={selectItem}
              onSelectDay={(d) => {
                setDayFocus(d);
                setSelection(null);
              }}
            />
          )}
          {view === "week" && <WeekView weekStart={weekStart} today={today} items={items} selectedKey={selectedKey} onSelect={selectItem} />}
          {view === "list" && <ListView today={today} items={items} selectedKey={selectedKey} onSelect={selectItem} />}
          {view === "dontmiss" && (
            <DontMissView
              today={today}
              items={items}
              openNow={openNow}
              pending={pending}
              selectedKey={selectedKey}
              onSelect={selectItem}
              onSelectEvent={selectEvent}
            />
          )}

          {view === "month" && dayFocus && !selection && (
            <DaySheet date={dayFocus} items={dayItems} onSelect={selectItem} onClose={() => setDayFocus(null)} />
          )}
        </main>

        {/* Desktop: side panel keeps the calendar visible. */}
        {selection && (
          <div className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[380px] shrink-0 overflow-hidden rounded-xl border border-zinc-200 shadow-sm lg:block dark:border-zinc-800">
            <DetailPanel selection={selection} onClose={() => setSelection(null)} />
          </div>
        )}
      </div>

      {/* Mobile / tablet: bottom sheet. */}
      {selection && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelection(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-2xl shadow-xl">
            <DetailPanel selection={selection} onClose={() => setSelection(null)} />
          </div>
        </div>
      )}

      <footer className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        Every listing links to its source. Dates, times and prices appear only when the source confirms them — otherwise they&apos;re marked
        &ldquo;not yet announced.&rdquo;
      </footer>
    </div>
  );
}

function DaySheet({
  date,
  items,
  onSelect,
  onClose,
}: {
  date: string;
  items: CalendarItem[];
  onSelect: (it: CalendarItem) => void;
  onClose: () => void;
}) {
  return (
    <section className="mt-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{formatShortDate(date)}</h3>
        <button onClick={onClose} className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Close
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nothing curated for this day.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <button onClick={() => onSelect(it)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <Dot color={it.color} />
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const NATIONAL_LABELS: Record<NationalInterest, string> = {
  golf: "Golf",
  major_sports: "Major sports",
  olympics: "Olympics",
  special_experiences: "Special experiences",
};

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-zinc-900 dark:accent-zinc-100" />
      {children}
    </label>
  );
}

function FilterBar({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  const set = (patch: Partial<Preferences>) => onChange({ ...prefs, ...patch });
  return (
    <div className="mt-3 grid gap-4 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Categories</legend>
        <Toggle checked={prefs.dallas} onChange={(v) => set({ dallas: v })}>Dallas events</Toggle>
        <Toggle checked={prefs.toddler} onChange={(v) => set({ toddler: v })}>Toddler / family events</Toggle>
        <Toggle checked={prefs.church} onChange={(v) => set({ church: v })}>Church & community events</Toggle>
        <Toggle checked={prefs.signup} onChange={(v) => set({ signup: v })}>Signup alerts</Toggle>
        <Toggle checked={prefs.national} onChange={(v) => set({ national: v })}>National coveted experiences</Toggle>
        <Toggle checked={prefs.sports} onChange={(v) => set({ sports: v })}>Pro &amp; college sports</Toggle>
        <Toggle checked={prefs.networking} onChange={(v) => set({ networking: v })}>Networking &amp; business</Toggle>
      </fieldset>
      <fieldset className="space-y-2" disabled={!prefs.national}>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">National interests</legend>
        {(Object.keys(NATIONAL_LABELS) as NationalInterest[]).map((k) => (
          <Toggle
            key={k}
            checked={prefs.nationalInterests[k]}
            onChange={(v) => set({ nationalInterests: { ...prefs.nationalInterests, [k]: v } })}
          >
            {NATIONAL_LABELS[k]}
          </Toggle>
        ))}
        <p className="pt-1 text-xs text-zinc-500">Dallas, TX · 30-mile radius · child age 1–3</p>
      </fieldset>
    </div>
  );
}
