import { normalizeDateTime } from "./datetime";
import type { StructuredInput } from "./classify";

// WordPress "The Events Calendar" (tribe) REST API: /wp-json/tribe/events/v1/events.
// Widely used by churches, farmers markets, museums and civic groups in DFW.

interface TribeVenue {
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  stateprovince?: string;
  zip?: string;
}

interface TribeEvent {
  title?: string;
  description?: string;
  url?: string;
  start_date?: string; // "2026-10-24 17:30:00" in the event's timezone
  end_date?: string;
  all_day?: boolean;
  timezone?: string;
  cost?: string;
  venue?: TribeVenue | TribeVenue[] | [];
  status?: string;
}

export interface TribePage {
  events?: TribeEvent[];
  next_rest_url?: string;
  total_pages?: number;
}

export function tribeEndpoint(siteOrigin: string, today: string): string {
  const base = siteOrigin.replace(/\/+$/, "");
  return `${base}/wp-json/tribe/events/v1/events?start_date=${today}&per_page=50&status=publish`;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;|&rsquo;|&#039;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function parseTribePage(page: TribePage): StructuredInput[] {
  const out: StructuredInput[] = [];
  for (const e of page.events ?? []) {
    if (!e.title || !e.start_date) continue;
    const start = normalizeDateTime(e.start_date.replace(" ", "T"), e.timezone);
    if (!start) continue;
    const end = e.end_date ? normalizeDateTime(e.end_date.replace(" ", "T"), e.timezone) : null;
    const allDay = Boolean(e.all_day);
    const multiDay = end && end.date !== start.date;
    const venue = Array.isArray(e.venue) ? e.venue[0] : e.venue;
    const state = venue?.stateprovince ?? venue?.state ?? null;
    const address = venue?.address
      ? [venue.address, venue.city, [state, venue.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      : null;
    out.push({
      title: decode(e.title),
      description: e.description ? decode(e.description) : null,
      event_date: start.date,
      end_date: multiDay ? end!.date : null,
      start_time: allDay ? null : start.time,
      end_time: allDay || multiDay ? null : (end?.time ?? null),
      venue: venue?.venue ? decode(venue.venue) : null,
      address,
      city: venue?.city ?? null,
      state,
      cost: e.cost ? decode(e.cost) : null,
      url: e.url ?? null,
      cancelled: /cancel/i.test(e.status ?? ""),
    });
  }
  return out;
}
