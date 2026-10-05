import { describe, expect, it } from "vitest";
import { enforceEvidence, type Extractor } from "@/lib/pipeline/extract";
import { htmlToText } from "@/lib/pipeline/fetch";
import { runPipeline } from "@/lib/pipeline/run";
import { MemoryStateStore } from "@/lib/pipeline/state";
import { churchSource, extracted, FakeHttp, FALL_PAGE, MemoryRepo } from "./helpers";

const NOW = new Date("2026-10-03T12:00:00Z");

describe("evidence check", () => {
  it("nulls any date the page does not literally support", () => {
    const text = htmlToText(FALL_PAGE);
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
  const bibleStudy = extracted({
    title: "Wednesday Bible Study",
    description: null,
    activities: [],
    event_date: null,
    start_time: null,
    end_time: null,
    evidence: [],
  });

  it("publishes a verified church festival via AI, rejects Bible study, and is idempotent", async () => {
    const repo = new MemoryRepo();
    const state = new MemoryStateStore();
    const extract: Extractor = async () => [extracted({}), bibleStudy];
    const run = (http = new FakeHttp({ [churchSource.url]: FALL_PAGE })) =>
      runPipeline({ sources: [churchSource], extract, repo, state, http, now: NOW });

    const first = await run();
    expect(first.sources_ok).toBe(1);
    expect(first.published).toBe(1);
    expect(first.feeders_used).toEqual({ html_ai: 1 });
    expect(first.rejected_validation.map((r) => r.title)).toContain("Wednesday Bible Study");
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ event_date: "2026-10-24", start_time: "16:00", is_church_hosted: true });
    expect(repo.runs).toHaveLength(1);

    // Second run: the page is unchanged (same content hash) → no AI call, event re-confirmed.
    let aiCalls = 0;
    const counting: Extractor = async (a) => {
      aiCalls++;
      return extract(a);
    };
    const second = await runPipeline({
      sources: [churchSource],
      extract: counting,
      repo,
      state,
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE }),
      now: new Date("2026-10-04T12:00:00Z"),
    });
    expect(aiCalls).toBe(0);
    expect(second.sources_unchanged).toEqual(["test-church"]);
    expect(second.reconfirmed).toBe(1);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].last_verified_at.startsWith("2026-10-04")).toBe(true);
  });

  it("sends conditional GET validators and treats 304 as unchanged", async () => {
    const state = new MemoryStateStore();
    const repo = new MemoryRepo();
    await runPipeline({
      sources: [churchSource],
      extract: async () => [extracted({})],
      repo,
      state,
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE }),
      now: NOW,
    });
    const http = new FakeHttp({ [churchSource.url]: { status: 304 } });
    const summary = await runPipeline({ sources: [churchSource], extract: null, repo, state, http, now: NOW });
    expect(http.calls[0].opts?.etag).toBe(`"etag-${churchSource.url}"`);
    expect(summary.sources_unchanged).toEqual(["test-church"]);
  });

  it("isolates failures, records them, and backs off the failing source", async () => {
    const repo = new MemoryRepo();
    const state = new MemoryStateStore();
    const healthy = { ...churchSource, id: "healthy", url: "https://ok.example.org/" };
    const http = new FakeHttp({ [healthy.url]: FALL_PAGE, [churchSource.url]: { status: 503 } });
    const summary = await runPipeline({
      sources: [churchSource, healthy],
      extract: async () => [extracted({})],
      repo,
      state,
      http,
      now: NOW,
    });
    expect(summary.sources_failed).toEqual([{ id: "test-church", error: expect.stringContaining("503"), consecutive_failures: 1 }]);
    expect(summary.sources_ok).toBe(1);
    expect(repo.rows).toHaveLength(1);

    // Next day the failing source is still in backoff (1 day after 1 failure → due again);
    // after a second failure it waits 2 days.
    await runPipeline({ sources: [churchSource], extract: null, repo, state, http, now: new Date("2026-10-04T12:00:00Z") });
    const third = await runPipeline({ sources: [churchSource], extract: null, repo, state, http, now: new Date("2026-10-05T12:00:00Z") });
    expect(third.sources_skipped_backoff).toEqual(["test-church"]);
  });

  it("uses structured feeds without calling AI", async () => {
    const page = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Toddler Storytime: Pumpkins",
      startDate: "2026-10-17T10:00:00-05:00",
      endDate: "2026-10-17T10:30:00-05:00",
      location: { "@type": "Place", name: "Lakewood Library", address: { streetAddress: "6121 Worth St", addressLocality: "Dallas", addressRegion: "TX" } },
      isAccessibleForFree: true,
    })}</script></head><body>Storytime</body></html>`;
    let aiCalls = 0;
    const repo = new MemoryRepo();
    const summary = await runPipeline({
      sources: [{ ...churchSource, is_church: false, group: "civic" }],
      extract: async () => {
        aiCalls++;
        return [];
      },
      repo,
      http: new FakeHttp({ [churchSource.url]: page }),
      now: NOW,
    });
    expect(aiCalls).toBe(0);
    expect(summary.feeders_used).toEqual({ jsonld: 1 });
    expect(repo.rows[0]).toMatchObject({
      title: "Toddler Storytime: Pumpkins",
      category: "TODDLER_EVENT",
      subcategory: "storytime",
      event_date: "2026-10-17",
      start_time: "10:00",
      end_time: "10:30",
      venue: "Lakewood Library",
      cost: "Free",
    });
  });

  it("caps volume per week but never cuts signup alerts", async () => {
    const repo = new MemoryRepo();
    const many = Array.from({ length: 6 }, (_, i) =>
      extracted({ title: ["Harvest Festival", "Pumpkin Carnival", "Trunk or Treat", "Hayride Night", "Fall Fair", "Costume Parade"][i], evidence: [{ field: "event_date", quote: "Saturday, October 24, 2026" }], start_time: null, end_time: null }),
    );
    const alert = extracted({
      title: "Holiday Train Tickets",
      kind: "signup_alert",
      signup_required: true,
      signup_type: "TICKET_RELEASE",
      evidence: [{ field: "event_date", quote: "Saturday, October 24, 2026" }],
      start_time: null,
      end_time: null,
    });
    const summary = await runPipeline({
      sources: [churchSource],
      extract: async () => [...many, alert],
      repo,
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE }),
      now: NOW,
      maxPerWeek: 4,
    });
    expect(summary.cut_for_volume).toHaveLength(2);
    expect(repo.rows.some((r) => r.title === "Holiday Train Tickets")).toBe(true);
    expect(repo.rows).toHaveLength(5);
  });

  it("writes nothing on a dry run", async () => {
    const repo = new MemoryRepo();
    const state = new MemoryStateStore();
    const summary = await runPipeline({
      sources: [churchSource],
      extract: async () => [extracted({})],
      repo,
      state,
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE }),
      now: NOW,
      dryRun: true,
    });
    expect(summary.published).toBe(1);
    expect(repo.rows).toHaveLength(0);
    expect((await state.getAll()).size).toBe(0);
  });

  it("marks stored events completed once they pass", async () => {
    const repo = new MemoryRepo();
    const http = new FakeHttp({ [churchSource.url]: FALL_PAGE });
    await runPipeline({ sources: [churchSource], extract: async () => [extracted({})], repo, http, now: NOW });
    const later = await runPipeline({
      sources: [churchSource],
      extract: async () => [],
      repo,
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE + " " }),
      now: new Date("2026-10-26T12:00:00Z"),
    });
    expect(later.marked_completed).toBe(1);
    expect(repo.rows[0].status).toBe("COMPLETED");
  });

  it("reports when AI is needed but unavailable", async () => {
    const summary = await runPipeline({
      sources: [churchSource],
      extract: null,
      repo: new MemoryRepo(),
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE }),
      now: NOW,
    });
    expect(summary.notes).toEqual([{ source: "test-church", note: expect.stringContaining("ANTHROPIC_API_KEY") }]);
  });
});

describe("standing programs", () => {
  it("folds a program listed every day into its next occurrence", async () => {
    const { collapseLongSeries } = await import("@/lib/pipeline/run");
    const { SEED_EVENTS } = await import("@/data/seed");
    const base = SEED_EVENTS.find((e) => e.id === "prestoncrest-pumpkinfest-2026")!;
    const daily = ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"].map((d, i) => ({
      ...base,
      id: `patch-${i}`,
      title: "Daily Pumpkin Patch",
      event_date: d,
    }));
    const summary = { collapsed_series: [] as { title: string; occurrences: number }[] };
    const out = collapseLongSeries(daily, "2026-10-05", summary);
    expect(out).toHaveLength(1);
    expect(out[0].event_date).toBe("2026-10-05");
    expect(out[0].description).toContain("listed on 5 dates");
    expect(summary.collapsed_series).toEqual([{ title: "Daily Pumpkin Patch", occurrences: 5 }]);
  });
});

describe("source reconciliation", () => {
  it("replaces a source's stale listings when it is re-read", async () => {
    const repo = new MemoryRepo();
    const state = new MemoryStateStore();
    await runPipeline({ sources: [churchSource], extract: async () => [extracted({})], repo, state, http: new FakeHttp({ [churchSource.url]: FALL_PAGE }), now: NOW });
    expect(repo.rows.map((r) => r.event_date)).toEqual(["2026-10-24"]);
    // The church moves the festival a week later.
    const moved = FALL_PAGE.replace("October 24", "October 31").replace("Saturday, October 31", "Saturday, October 31");
    const summary = await runPipeline({
      sources: [churchSource],
      extract: async () => [extracted({ event_date: "2026-10-31", evidence: [{ field: "event_date", quote: "Saturday, October 31, 2026" }], start_time: null, end_time: null })],
      repo,
      state,
      http: new FakeHttp({ [churchSource.url]: moved }),
      now: NOW,
    });
    expect(summary.replaced).toBe(1);
    expect(repo.rows.map((r) => r.event_date)).toEqual(["2026-10-31"]);
  });
});

describe("cost evidence", () => {
  it("drops a price that is not on the page", () => {
    const page = "Fall Festival Saturday, October 24, 2026 from 4:00 PM – 7:00 PM. Admission $5.";
    expect(enforceEvidence(extracted({ cost: "$5" }), page).event.cost).toBe("$5");
    const { event, dropped } = enforceEvidence(extracted({ cost: "$12 per person" }), page);
    expect(event.cost).toBeNull();
    expect(dropped).toContain("cost");
  });
});
