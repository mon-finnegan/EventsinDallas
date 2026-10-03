// Date helpers. All calendar math is done on "YYYY-MM-DD" strings in America/Chicago so the
// grid never drifts with the viewer's browser timezone.

export const DALLAS_TZ = "America/Chicago";

export function todayInDallas(now: Date = new Date()): string {
  return toLocalDate(now, DALLAS_TZ);
}

export function toLocalDate(d: Date, timeZone: string = DALLAS_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function toLocalTime(d: Date, timeZone: string = DALLAS_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** Split an action timestamp into local date + (optional) local time. */
export function splitActionAt(
  value: string,
  timeZone: string = DALLAS_TZ,
): { date: string; time: string | null } {
  if (value.length === 10) return { date: value, time: null };
  const d = new Date(value);
  return { date: toLocalDate(d, timeZone), time: toLocalTime(d, timeZone) };
}

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

/** Monday = 0 … Sunday = 6 (spec §13 grid starts on Monday). */
export function weekdayMon0(date: string): number {
  return (utc(date).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayMon0(date));
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** 6×7 (or 5×7) grid of dates covering the month, Monday-first. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  let cursor = startOfWeek(first);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  } while (monthKey(cursor) === month);
  return weeks;
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
}

export function formatMonthTitle(month: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    utc(`${month}-01`),
  );
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
