import type { CalendarEvent, ItemColor } from "@/lib/types";

export const COLOR_CLASSES: Record<ItemColor, { dot: string; pill: string; text: string; ring: string }> = {
  blue: {
    dot: "bg-blue-600",
    pill: "bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-900",
    text: "text-blue-700 dark:text-blue-300",
    ring: "ring-blue-600",
  },
  green: {
    dot: "bg-green-600",
    pill: "bg-green-50 text-green-900 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-100 dark:border-green-900",
    text: "text-green-700 dark:text-green-300",
    ring: "ring-green-600",
  },
  red: {
    dot: "bg-red-600",
    pill: "bg-red-50 text-red-900 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-100 dark:border-red-900",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-600",
  },
};

export const COLOR_LABEL: Record<ItemColor, string> = {
  blue: "Dallas events",
  green: "Toddler / family",
  red: "Don't miss / sign up",
};

export function Dot({ color, className = "" }: { color: ItemColor; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_CLASSES[color].dot} ${className}`} />;
}

export function UnknownBadge({ children = "Date not yet announced" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </span>
  );
}

export function ConfirmedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      Confirmed
    </span>
  );
}

export function churchTag(e: CalendarEvent) {
  return e.is_church_hosted ? (
    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
      Church / community
    </span>
  ) : null;
}

export function nationalTag(e: CalendarEvent) {
  return e.scope === "NATIONAL" ? (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      National
    </span>
  ) : null;
}
