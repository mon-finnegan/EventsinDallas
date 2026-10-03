import type { ExtractedEvent } from "@/lib/pipeline/extract";
import type { FetchOptions, FetchResult, HttpClient } from "@/lib/pipeline/http";
import type { Source } from "@/lib/pipeline/sources";
import type { EventRepository } from "@/lib/repository";
import type { CalendarEvent } from "@/lib/types";

export const churchSource: Source = {
  id: "test-church",
  name: "Test Church",
  url: "https://example.org/fall",
  source_type: "official_organization",
  group: "church",
  is_church: true,
  is_national: false,
  default_city: "Dallas",
};

type Route = string | { status: number; body?: string; headers?: Record<string, string> } | (() => never);

/** In-memory HTTP client: url → body (200), {status}, or a throwing function. Records calls. */
export class FakeHttp implements HttpClient {
  calls: { url: string; opts?: FetchOptions }[] = [];
  constructor(public routes: Record<string, Route>) {}
  async get(url: string, opts?: FetchOptions): Promise<FetchResult> {
    this.calls.push({ url, opts });
    const r = this.routes[url];
    if (r === undefined) throw new Error(`HTTP 404 fetching ${url}`);
    if (typeof r === "function") r();
    if (typeof r === "string") {
      return { status: "ok", url, body: r, contentType: "text/html", etag: `"etag-${url}"`, lastModified: null };
    }
    const route = r as { status: number; body?: string };
    if (route.status === 304) return { status: "not_modified", url };
    if (route.status >= 400) throw new Error(`HTTP ${route.status} fetching ${url}`);
    return { status: "ok", url, body: route.body ?? "", contentType: "text/html", etag: null, lastModified: null };
  }
}

export class MemoryRepo implements EventRepository {
  rows: CalendarEvent[] = [];
  runs: unknown[] = [];
  async list() {
    return this.rows;
  }
  async upsert(events: CalendarEvent[]) {
    const byId = new Map(this.rows.map((r) => [r.id, r]));
    for (const e of events) byId.set(e.id, e);
    this.rows = [...byId.values()];
  }
  async logRun(summary: unknown) {
    this.runs.push(summary);
  }
}

export function extracted(patch: Partial<ExtractedEvent>): ExtractedEvent {
  return {
    title: "Fall Festival",
    description: "Free community fall festival.",
    kind: "toddler_family_event",
    subcategory: "church_community",
    national_interest: null,
    event_date: "2026-10-24",
    end_date: null,
    start_time: "16:00",
    end_time: "19:00",
    venue: "Test Church",
    address: null,
    city: "Dallas",
    state: "TX",
    age_min: null,
    age_max: null,
    age_label: null,
    cost: "Free",
    activities: ["Trunk-or-treat", "Petting zoo", "Games", "Food trucks"],
    is_toddler_relevant: true,
    is_family_relevant: true,
    is_church_hosted: true,
    is_public_event: true,
    is_seasonal: true,
    signup_required: false,
    signup_type: null,
    signup_open_at: null,
    signup_close_at: null,
    lottery_open_at: null,
    lottery_close_at: null,
    ticket_release_at: null,
    action_note: null,
    event_url: null,
    registration_url: null,
    ticket_url: null,
    evidence: [
      { field: "event_date", quote: "Saturday, October 24, 2026" },
      { field: "start_time", quote: "4:00 PM – 7:00 PM" },
      { field: "end_time", quote: "4:00 PM – 7:00 PM" },
    ],
    ...patch,
  };
}

export const FALL_PAGE = `<html><body><h1>Fall Festival</h1>
<p>Join us Saturday, October 24, 2026 from 4:00 PM – 7:00 PM for our free community Fall Festival:
trunk-or-treat, petting zoo, games and food trucks.</p>
<p>Wednesday Bible Study meets weekly.</p></body></html>`;
