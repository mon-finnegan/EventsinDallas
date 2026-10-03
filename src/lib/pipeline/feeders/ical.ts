import { inclusiveEndDate, normalizeDateTime } from "./datetime";
import type { StructuredInput } from "./classify";

// Minimal RFC 5545 reader for event feeds (Squarespace `?format=ical`, Google Calendar,
// WordPress, CivicPlus, LibraryMarket…). Recurring series (RRULE) are skipped on purpose:
// weekly programming is exactly the "generic listing" the calendar avoids.

interface Prop {
  value: string;
  params: Record<string, string>;
}

export function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function parseLine(line: string): [string, Prop] | null {
  const colon = findValueColon(line);
  if (colon < 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return [name.toUpperCase(), { value: line.slice(colon + 1), params }];
}

/** The first colon not inside a quoted parameter value. */
function findValueColon(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) return i;
  }
  return -1;
}

export function parseICal(ics: string, opts: { today: string }): StructuredInput[] {
  const out: StructuredInput[] = [];
  let current: Map<string, Prop> | null = null;

  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") {
      current = new Map();
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const ev = toInput(current);
        if (ev && (ev.end_date ?? ev.event_date)! >= opts.today) out.push(ev);
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (parsed && !current.has(parsed[0])) current.set(parsed[0], parsed[1]);
  }
  return out;
}

function toInput(props: Map<string, Prop>): StructuredInput | null {
  if (props.has("RRULE")) return null;
  const summary = props.get("SUMMARY");
  const dtstart = props.get("DTSTART");
  if (!summary || !dtstart) return null;

  const start = normalizeDateTime(dtstart.value, dtstart.params.TZID);
  if (!start) return null;

  let endDate: string | null = null;
  let endTime: string | null = null;
  const dtend = props.get("DTEND");
  if (dtend) {
    const end = normalizeDateTime(dtend.value, dtend.params.TZID);
    if (end) {
      if (end.time === null) {
        endDate = inclusiveEndDate(end.date);
      } else {
        endDate = end.date;
        endTime = end.time;
      }
    }
  }
  if (endDate && endDate < start.date) endDate = start.date;

  const location = props.get("LOCATION") ? unescapeText(props.get("LOCATION")!.value) : null;
  const [venue, ...rest] = location ? location.split(/,\s*/) : [null];
  const status = props.get("STATUS")?.value.toUpperCase();

  return {
    title: unescapeText(summary.value),
    description: props.get("DESCRIPTION") ? unescapeText(props.get("DESCRIPTION")!.value) : null,
    event_date: start.date,
    end_date: endDate && endDate !== start.date ? endDate : null,
    start_time: start.time,
    end_time: endDate && endDate !== start.date ? null : endTime,
    venue: venue ?? null,
    address: rest.length ? location : null,
    city: cityFromAddress(location),
    state: null,
    cost: null,
    url: props.get("URL")?.value ?? null,
    cancelled: status === "CANCELLED",
  };
}

/** Pull a city out of "Venue, 123 Main St, Dallas, TX 75201" style strings. */
export function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/,\s*([A-Za-z .'-]+),\s*(?:TX|Texas)\b/);
  return m ? m[1].trim() : null;
}
