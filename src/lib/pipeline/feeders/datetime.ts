import { DALLAS_TZ, toLocalDate, toLocalTime } from "../../dates";

export interface LocalDateTime {
  date: string; // YYYY-MM-DD in Dallas time
  time: string | null; // HH:MM, null for all-day / date-only values
}

/**
 * Normalize a feed timestamp to Dallas local date/time without guessing:
 *  - "2026-10-24"                    → date only
 *  - "2026-10-24T17:30:00-05:00" / Z → converted to America/Chicago
 *  - "2026-10-24T17:30[:00]" (floating, or with a Chicago TZID) → taken as Dallas wall time
 *  - other TZIDs                     → converted via that zone
 */
export function normalizeDateTime(value: string, tzid?: string | null): LocalDateTime | null {
  const v = value.trim();
  const dateOnly = v.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (dateOnly) return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };

  const m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})[T ](\d{2}):?(\d{2})(?::?(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , offset] = m;

  if (offset) {
    const iso = `${y}-${mo}-${d}T${h}:${mi}:00${offset === "Z" ? "Z" : offset.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset}`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return { date: toLocalDate(date, DALLAS_TZ), time: toLocalTime(date, DALLAS_TZ) };
  }

  if (!tzid || tzid === DALLAS_TZ || /central|chicago/i.test(tzid)) {
    return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
  }

  const instant = zonedWallTimeToInstant(Number(y), Number(mo), Number(d), Number(h), Number(mi), tzid);
  if (!instant) return null;
  return { date: toLocalDate(instant, DALLAS_TZ), time: toLocalTime(instant, DALLAS_TZ) };
}

/** Find the instant at which the given wall-clock time occurs in `timeZone`. */
function zonedWallTimeToInstant(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date | null {
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return new Date(guess - (asIfUtc - guess));
  } catch {
    return null; // Unknown time zone name.
  }
}

/** iCal all-day DTEND is exclusive; convert to the inclusive last day. */
export function inclusiveEndDate(exclusive: string): string {
  const d = new Date(`${exclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
