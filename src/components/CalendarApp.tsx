"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCalendarItems, collapseRepeats, isExpired, pendingActions } from "@/lib/calendar";
import { addDays, addMonths, formatLongDate, formatMonthTitle, formatShortDate, monthKey, startOfWeek } from "@/lib/dates";
import { DEFAULT_PREFERENCES, matchesPreferences, type Preferences } from "@/lib/filters";
import type { CalendarEvent, CalendarItem, NationalInterest } from "@/lib/types";
import { DetailPanel, type Selection } from "./DetailPanel";
import { CARD, COLOR_CLASSES, COLOR_LABEL, Dot, eventEmoji } from "./ui";
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
    const all = collapseRepeats(buildCalendarItems(visibleEvents), today);
    return prefs.signup ? all : all.filter((it) => it.color !== "red");
  }, [visibleEvents, prefs.signup, today]);
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
  const weekAhead = useMemo(() => {
    const end = addDays(today, 6);
    return items.filter((it) => it.date >= today && it.date <= end && it.color !== "red").length;
  }, [items, today]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pb-6 pt-5 sm:px-6 lg:pt-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-900/5 backdrop-blur dark:bg-white/5 dark:text-stone-300 dark:ring-white/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Updated daily · {formatLongDate(today)}
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            Mon&apos;s{" "}
            <span className="bg-gradient-to-r from-rose-500 via-orange-400 to-violet-500 bg-clip-text text-transparent">Dallas List</span>
          </h1>
          <p className="mt-3 max-w-xl text-base text-stone-600 dark:text-stone-400">
            The best family outings, grown-up nights and community festivals in DFW — plus every signup date you can&apos;t afford to miss.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Stat value={weekAhead} label="this week" />
            <Stat value={upcomingActionCount} label="sign-ups to watch" accent />
          </div>
        </div>
        <nav aria-label="Calendar views" className="flex w-full rounded-2xl bg-stone-900/5 p-1 backdrop-blur sm:w-auto dark:bg-white/5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => changeView(v.id)}
              aria-pressed={view === v.id}
              className={`relative flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all sm:flex-none ${view === v.id ? "bg-white text-stone-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
            >
              {v.label}
              {v.id === "dontmiss" && upcomingActionCount > 0 && (
                <span className="ml-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {upcomingActionCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <QuickFilters prefs={prefs} onChange={updatePrefs} showMore={showFilters} onToggleMore={() => setShowFilters((s) => !s)} />
      {showFilters && <FilterBar prefs={prefs} onChange={updatePrefs} />}

      <div className="mt-6 flex flex-1 gap-5">
        <main className="@container min-w-0 flex-1">
          {(view === "month" || view === "week") && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {view === "month"
                  ? formatMonthTitle(month)
                  : `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
              </h2>
              <div className="hidden items-center gap-3 text-xs font-medium text-stone-500 md:flex dark:text-stone-400">
                {(["blue", "green", "red"] as const).map((c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    <Dot color={c} /> {COLOR_LABEL[c]}
                    {view === "month" && <span className="tabular-nums text-stone-400">{counts[c]}</span>}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ring-stone-900/5 backdrop-blur dark:bg-white/5 dark:ring-white/10">
                <button
                  onClick={() => (view === "month" ? setMonth(addMonths(month, -1)) : setWeekStart(addDays(weekStart, -7)))}
                  className={NAV_BTN}
                  aria-label="Previous"
                >
                  ‹
                </button>
                <button
                  onClick={() => {
                    setMonth(monthKey(today));
                    setWeekStart(startOfWeek(today));
                  }}
                  className="rounded-full px-3 py-1 text-sm font-semibold hover:bg-stone-900/5 dark:hover:bg-white/10"
                >
                  Today
                </button>
                <button
                  onClick={() => (view === "month" ? setMonth(addMonths(month, 1)) : setWeekStart(addDays(weekStart, 7)))}
                  className={NAV_BTN}
                  aria-label="Next"
                >
                  ›
                </button>
              </div>
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
          <div className={`sticky top-4 hidden h-[calc(100vh-2rem)] w-[400px] shrink-0 overflow-hidden lg:block ${CARD}`}>
            <DetailPanel selection={selection} onClose={() => setSelection(null)} />
          </div>
        )}
      </div>

      {/* Mobile / tablet: bottom sheet. */}
      {selection && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm" onClick={() => setSelection(null)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col overflow-hidden rounded-t-[2rem] bg-surface shadow-2xl">
            <div className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/60" />
            <DetailPanel selection={selection} onClose={() => setSelection(null)} />
          </div>
        </div>
      )}

      <footer className="mt-10 border-t border-stone-900/10 pt-5 text-xs text-stone-500 dark:border-white/10 dark:text-stone-400">
        Every listing links to its source. Dates, times and prices appear only when the source confirms them — otherwise they&apos;re marked
        &ldquo;not yet announced.&rdquo;
      </footer>
    </div>
  );
}

const NAV_BTN =
  "flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none hover:bg-stone-900/5 dark:hover:bg-white/10";

function Stat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-1.5 ring-1 backdrop-blur ${accent ? "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-200" : "bg-white/60 text-stone-700 ring-stone-900/5 dark:bg-white/5 dark:text-stone-200 dark:ring-white/10"}`}
    >
      <span className="font-display text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium">{label}</span>
    </span>
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
    <section className={`mt-4 p-4 ${CARD}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">{formatLongDate(date)}</h3>
        <button onClick={onClose} className="rounded-full px-3 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-900/5 hover:text-stone-900 dark:hover:bg-white/10 dark:hover:text-white">
          Close
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">Nothing curated for this day.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <button onClick={() => onSelect(it)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm hover:bg-stone-900/5 dark:hover:bg-white/5">
                <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg ${COLOR_CLASSES[it.color].cover}`}>
                  {eventEmoji(it.event, it.color)}
                </span>
                <span className="font-medium">{it.label}</span>
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
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-violet-600" />
      {children}
    </label>
  );
}

function FilterBar({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  const set = (patch: Partial<Preferences>) => onChange({ ...prefs, ...patch });
  return (
    <div className={`mt-3 grid gap-4 p-5 sm:grid-cols-2 ${CARD}`}>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">Categories</legend>
        <Toggle checked={prefs.dallas} onChange={(v) => set({ dallas: v })}>Dallas events</Toggle>
        <Toggle checked={prefs.toddler} onChange={(v) => set({ toddler: v })}>Toddler / family events</Toggle>
        <Toggle checked={prefs.church} onChange={(v) => set({ church: v })}>Church & community events</Toggle>
        <Toggle checked={prefs.signup} onChange={(v) => set({ signup: v })}>Signup alerts</Toggle>
        <Toggle checked={prefs.national} onChange={(v) => set({ national: v })}>National coveted experiences</Toggle>
        <Toggle checked={prefs.grownup} onChange={(v) => set({ grownup: v })}>Grown-up outings (food, drinks, live music)</Toggle>
        <Toggle checked={prefs.sports} onChange={(v) => set({ sports: v })}>Major sports games</Toggle>
        <Toggle checked={prefs.networking} onChange={(v) => set({ networking: v })}>Networking &amp; business</Toggle>
      </fieldset>
      <fieldset className="space-y-2" disabled={!prefs.national}>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">National interests</legend>
        {(Object.keys(NATIONAL_LABELS) as NationalInterest[]).map((k) => (
          <Toggle
            key={k}
            checked={prefs.nationalInterests[k]}
            onChange={(v) => set({ nationalInterests: { ...prefs.nationalInterests, [k]: v } })}
          >
            {NATIONAL_LABELS[k]}
          </Toggle>
        ))}
        <p className="pt-1 text-xs text-stone-500">Dallas, TX · 30-mile radius · child age 1–3</p>
      </fieldset>
    </div>
  );
}

const QUICK: { key: Exclude<keyof Preferences, "nationalInterests">; label: string; emoji: string }[] = [
  { key: "toddler", label: "Little ones", emoji: "🧸" },
  { key: "dallas", label: "Around Dallas", emoji: "📍" },
  { key: "grownup", label: "Date night", emoji: "🍷" },
  { key: "church", label: "Community", emoji: "⛪" },
  { key: "networking", label: "Networking", emoji: "🤝" },
  { key: "sports", label: "Big games", emoji: "🏟️" },
  { key: "national", label: "Bucket list", emoji: "🌟" },
  { key: "signup", label: "Sign-ups", emoji: "⏰" },
];

function QuickFilters({
  prefs,
  onChange,
  showMore,
  onToggleMore,
}: {
  prefs: Preferences;
  onChange: (p: Preferences) => void;
  showMore: boolean;
  onToggleMore: () => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6" role="group" aria-label="Quick filters">
      {QUICK.map(({ key, label, emoji }) => {
        const on = prefs[key];
        return (
          <button
            key={key}
            onClick={() => onChange({ ...prefs, [key]: !on })}
            aria-pressed={on}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-all ${on ? "bg-stone-900 text-white ring-stone-900 dark:bg-white dark:text-stone-900 dark:ring-white" : "bg-white/60 text-stone-500 ring-stone-900/10 backdrop-blur hover:text-stone-900 dark:bg-white/5 dark:text-stone-400 dark:ring-white/10 dark:hover:text-white"}`}
          >
            <span aria-hidden className={on ? "" : "grayscale"}>
              {emoji}
            </span>
            {label}
          </button>
        );
      })}
      <button
        onClick={onToggleMore}
        aria-expanded={showMore}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-stone-600 border border-dashed border-stone-900/20 hover:bg-white/60 dark:text-stone-300 dark:border-white/20 dark:hover:bg-white/5"
      >
        {showMore ? "Less" : "More filters"}
      </button>
    </div>
  );
}
