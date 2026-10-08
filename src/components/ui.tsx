import type { CalendarEvent, ItemColor, Subcategory } from "@/lib/types";

export const COLOR_CLASSES: Record<
  ItemColor,
  { dot: string; pill: string; text: string; ring: string; bar: string; soft: string; cover: string }
> = {
  blue: {
    dot: "bg-indigo-500",
    pill: "bg-indigo-50/80 text-indigo-950 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25",
    text: "text-indigo-600 dark:text-indigo-300",
    ring: "ring-indigo-500",
    bar: "bg-indigo-500",
    soft: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-200",
    cover: "from-indigo-500 via-violet-500 to-fuchsia-400",
  },
  green: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50/80 text-emerald-950 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25",
    text: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-500",
    bar: "bg-emerald-500",
    soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    cover: "from-emerald-400 via-teal-400 to-sky-400",
  },
  red: {
    dot: "bg-rose-500",
    pill: "bg-rose-50/80 text-rose-950 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-100 dark:hover:bg-rose-500/25",
    text: "text-rose-600 dark:text-rose-300",
    ring: "ring-rose-500",
    bar: "bg-rose-500",
    soft: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
    cover: "from-rose-500 via-orange-400 to-amber-300",
  },
};

export const COLOR_LABEL: Record<ItemColor, string> = {
  blue: "Dallas events",
  green: "Toddler / family",
  red: "Don't miss / sign up",
};

const SUBCATEGORY_EMOJI: Partial<Record<Subcategory, string>> = {
  festival: "🎪",
  parade: "🎉",
  seasonal: "🍂",
  holiday: "✨",
  church_community: "⛪",
  community: "🏘️",
  sports: "🏟️",
  golf: "⛳",
  museum: "🏛️",
  zoo: "🦒",
  animals: "🐐",
  farm: "🚜",
  storytime: "📚",
  music: "🎶",
  theater: "🎭",
  easter: "🐣",
  halloween: "🎃",
  fall: "🍁",
  christmas: "🎄",
  spring: "🌷",
  summer: "☀️",
  reservation: "📝",
  registration: "📝",
  lottery: "🎟️",
  ticket_release: "🎟️",
  application: "📝",
  olympics: "🏅",
  special_experience: "🌟",
  networking: "🤝",
  food_drink: "🍷",
};

/** A small visual cue for the kind of outing; falls back by color. */
export function eventEmoji(e: CalendarEvent, color: ItemColor): string {
  if (e.subcategory && SUBCATEGORY_EMOJI[e.subcategory]) return SUBCATEGORY_EMOJI[e.subcategory]!;
  return color === "red" ? "⏰" : color === "green" ? "🧸" : "📍";
}

export function Dot({ color, className = "" }: { color: ItemColor; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_CLASSES[color].dot} ${className}`} />;
}

export function UnknownBadge({ children = "Date not yet announced" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-400/40 dark:text-amber-200">
      {children}
    </span>
  );
}

export function ConfirmedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-400/40 dark:text-emerald-200">
      ✓ Confirmed
    </span>
  );
}

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

export function churchTag(e: CalendarEvent) {
  return e.is_church_hosted ? <span className={`${tag} bg-violet-500/10 text-violet-700 dark:text-violet-200`}>Church / community</span> : null;
}

export function nationalTag(e: CalendarEvent) {
  return e.scope === "NATIONAL" ? <span className={`${tag} bg-sky-500/10 text-sky-700 dark:text-sky-200`}>National</span> : null;
}

export function priceTag(label: string | null) {
  return label ? (
    <span className={`${tag} ${label === "Free" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "bg-stone-900/5 text-stone-700 dark:bg-white/10 dark:text-stone-200"}`}>
      {label}
    </span>
  ) : null;
}

/** Frosted card surface used across views. */
export const CARD =
  "rounded-3xl border border-white/70 bg-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(60,40,120,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none";
