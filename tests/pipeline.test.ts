import { describe, expect, it } from "vitest";
import { enforceEvidence, type ExtractedEvent, type Extractor } from "@/lib/pipeline/extract";
import { htmlToText } from "@/lib/pipeline/fetch";
import { runPipeline } from "@/lib/pipeline/run";
import type { Source } from "@/lib/pipeline/sources";
import type { EventRepository } from "@/lib/repository";
import type { CalendarEvent } from "@/lib/types";

const source: Source = {
  id: "test-church",
  name: "Test Church",
  url: "https://example.org/fall",
  source_type: "official_organization",
  is_church: true,
  is_national: false,
};

const PAGE = `<html><body><h1>Fall Festival</h1>
<p>Join us Saturday, October 24, 2026 from 4:00 PM – 7:00 PM for our free community Fall Festival:
trunk-or-treat, petting zoo, games and food trucks.</p>
<p>Wednesday Bible Study meets weekly.</p></body></html>`;

function extracted(patch: Partial<ExtractedEvent>): ExtractedEvent {
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

class MemoryRepo implements EventRepository {
  rows: CalendarEvent[] = [];
  async list() {
    return this.rows;
  }
  async upsert(events: CalendarEvent[]) {
    const byId = new Map(this.rows.map((r) => [r.id, r]));
    for (const e of events) byId.set(e.id, e);
    this.rows = [...byId.values()];
  }
}

describe("evidence check", () => {
  it("nulls any date the page does not literally support", () => {
    const text = htmlToText(PAGE);
    const { event, dropped } = enforceEvidence(
      extracted({
        signup_type: "REGISTRATION",
        signup_required: true,
        signup_open_at: "2026-10-01",
        evidence: [
          { field: "event_date", quote: "Saturday, October 24, 2026" },
          { field: "signup_open_at", quote: "Registration opens October 1" }, // not on the page
        ],
      }),
      text,
    );
    expect(event.event_date).toBe("2026-10-24");
    expect(event.signup_open_at).toBeNull();
    expect(event.start_time).toBeNull(); // no evidence supplied for it
    expect(dropped).toEqual(expect.arrayContaining(["signup_open_at", "start_time", "end_time"]));
  });
});

describe("runPipeline", () => {
  it("publishes a verified church festival, rejects Bible study, and is idempotent", async () => {
    const repo = new MemoryRepo();
    const extract: Extractor = async () => [
      extracted({}),
      extracted({
        title: "Wednesday Bible Study",
        description: null,
        activities: [],
        event_date: null,
        start_time: null,
        end_time: null,
        evidence: [],
      }),
    ];
    const run = () =>
      runPipeline({
        sources: [source],
        extract,
        repo,
        fetchText: async () => htmlToText(PAGE),
        now: new Date("2026-10-03T12:00:00Z"),
      });

    const first = await run();
    expect(first.sources_ok).toBe(1);
    expect(first.published).toBe(1);
    expect(first.rejected_validation.map((r) => r.title)).toContain("Wednesday Bible Study");
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ event_date: "2026-10-24", start_time: "16:00", is_church_hosted: true });

    await run();
    expect(repo.rows).toHaveLength(1);
  });

  it("records failing sources without aborting the run", async () => {
    const repo = new MemoryRepo();
    const summary = await runPipeline({
      sources: [source],
      extract: async () => [],
      repo,
      fetchText: async () => {
        throw new Error("HTTP 503");
      },
    });
    expect(summary.sources_failed).toEqual([{ id: "test-church", error: "HTTP 503" }]);
  });

  it("marks stored events completed once they pass", async () => {
    const repo = new MemoryRepo();
    const opts = { sources: [source], extract: async () => [extracted({})], repo, fetchText: async () => htmlToText(PAGE) };
    await runPipeline({ ...opts, now: new Date("2026-10-03T12:00:00Z") });
    const later = await runPipeline({ ...opts, extract: async () => [], now: new Date("2026-10-26T12:00:00Z") });
    expect(later.marked_completed).toBe(1);
    expect(repo.rows[0].status).toBe("COMPLETED");
  });
});
