import { describe, expect, it } from "vitest";
import { classifyStructured, parseAgeRange } from "@/lib/pipeline/feeders/classify";
import { normalizeDateTime } from "@/lib/pipeline/feeders/datetime";
import { parseICal } from "@/lib/pipeline/feeders/ical";
import { discoverEventLinks, findICalUrl, runFeeder, chunkText } from "@/lib/pipeline/feeders";
import { parseJsonLdEvents } from "@/lib/pipeline/feeders/jsonld";
import { parseTribePage } from "@/lib/pipeline/feeders/tribe";
import { isDisallowed, parseRobots, retryDelay, createHttpClient } from "@/lib/pipeline/http";
import { enrichWithReviews, namesMatch } from "@/lib/pipeline/reviews";
import { backoffDays, isDue } from "@/lib/pipeline/state";
import { SEED_EVENTS } from "@/data/seed";
import { expandRollingSources, SOURCES } from "@/lib/pipeline/sources";
import { businessDiscoveryUrl, eventLikePosts, fetchInstagramPosts } from "@/lib/pipeline/feeders/instagram";
import { eventLikeRedditPosts, subredditSearchUrl } from "@/lib/pipeline/feeders/reddit";
import { churchSource, FakeHttp } from "./helpers";

const TODAY = "2026-10-03";

describe("datetime normalization", () => {
  it("converts offsets and UTC to Dallas time", () => {
    expect(normalizeDateTime("2026-10-24T22:30:00Z")).toEqual({ date: "2026-10-24", time: "17:30" });
    expect(normalizeDateTime("2026-10-25T02:00:00Z")).toEqual({ date: "2026-10-24", time: "21:00" });
    expect(normalizeDateTime("2026-12-05T16:00:00-06:00")).toEqual({ date: "2026-12-05", time: "16:00" });
  });
  it("does not shift midnight-UTC dates to the previous evening, and drops pre-dawn artifacts", () => {
    expect(normalizeDateTime("2026-11-06T00:00:00Z")).toEqual({ date: "2026-11-06", time: null });
    expect(normalizeDateTime("2026-11-06T00:00:00+00:00")).toEqual({ date: "2026-11-06", time: null });
    expect(normalizeDateTime("2026-10-24T08:30:00Z")).toEqual({ date: "2026-10-24", time: null }); // 3:30 AM local
  });
  it("keeps floating/Chicago wall time and converts other zones", () => {
    expect(normalizeDateTime("20261024T173000", "America/Chicago")).toEqual({ date: "2026-10-24", time: "17:30" });
    expect(normalizeDateTime("20261024T183000", "America/New_York")).toEqual({ date: "2026-10-24", time: "17:30" });
  });
  it("keeps date-only values date-only and rejects junk", () => {
    expect(normalizeDateTime("20261024")).toEqual({ date: "2026-10-24", time: null });
    expect(normalizeDateTime("next Saturday")).toBeNull();
  });
});

describe("iCal feeder", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:1",
    "SUMMARY:Trunk-or-Treat\\, Games & Petting Zoo",
    "DTSTART;TZID=America/Chicago:20261024T170000",
    "DTEND;TZID=America/Chicago:20261024T200000",
    "LOCATION:Lake Highlands Church\\, 9999 Example Rd\\, Dallas\\, TX 75238",
    "DESCRIPTION:Free for families. Bring the little ones!",
    "URL:https://example.org/trunk",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Weekly Bible Study",
    "DTSTART:20261007T190000Z",
    "RRULE:FREQ=WEEKLY",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Pumpkin Patch Opening",
    "DTSTART;VALUE=DATE:20261010",
    "DTEND;VALUE=DATE:20261012",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Already Happened",
    "DTSTART:20260901T150000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Long title that is folded across",
    "  two lines",
    "DTSTART:20261101T150000Z",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("parses events, skips recurring series and past events, converts all-day DTEND", () => {
    const events = parseICal(ics, { today: TODAY });
    expect(events.map((e) => e.title)).toEqual([
      "Trunk-or-Treat, Games & Petting Zoo",
      "Pumpkin Patch Opening",
      "Long title that is folded across two lines",
    ]);
    expect(events[0]).toMatchObject({
      event_date: "2026-10-24",
      start_time: "17:00",
      end_time: "20:00",
      venue: "Lake Highlands Church",
      city: "Dallas",
      url: "https://example.org/trunk",
    });
    expect(events[1]).toMatchObject({ event_date: "2026-10-10", end_date: "2026-10-11", start_time: null });
    expect(events[2].cancelled).toBe(true);
  });

  it("classifies toddler-friendly church events", () => {
    const [first] = parseICal(ics, { today: TODAY });
    const c = classifyStructured(first, churchSource);
    expect(c).toMatchObject({ kind: "toddler_family_event", subcategory: "halloween", is_church_hosted: true, is_seasonal: true });
  });
});

describe("JSON-LD feeder", () => {
  it("reads @graph events, offers and cancellation", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "WebPage", name: "x" },
        {
          "@type": ["Event", "Festival"],
          name: "Greek Food Festival &amp; Dancing",
          startDate: "2026-11-06T11:00:00-06:00",
          endDate: "2026-11-08T17:00:00-06:00",
          location: { name: "Holy Trinity", address: "13555 Hillcrest Rd, Dallas, TX 75240" },
          offers: [{ price: "5" }, { price: 10 }],
        },
        { "@type": "Event", name: "Cancelled Concert", startDate: "2026-10-10", eventStatus: "https://schema.org/EventCancelled" },
        { "@type": "Event", name: "Old", startDate: "2025-10-10" },
      ],
    })}</script><script type="application/ld+json">{broken</script>`;
    const events = parseJsonLdEvents(html, { today: TODAY, pageUrl: "https://example.org/" });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Greek Food Festival & Dancing",
      event_date: "2026-11-06",
      end_date: "2026-11-08",
      start_time: "11:00",
      end_time: null,
      venue: "Holy Trinity",
      city: "Dallas",
      cost: "$5–$10",
    });
    expect(events[1].cancelled).toBe(true);
  });
});

describe("WordPress Events Calendar feeder", () => {
  it("maps tribe REST events", () => {
    const events = parseTribePage({
      events: [
        {
          title: "Dallas&#8217; Original Pumpkin Day",
          start_date: "2026-10-03 10:00:00",
          end_date: "2026-10-03 16:00:00",
          timezone: "America/Chicago",
          cost: "Free",
          url: "https://dallasfarmersmarket.org/event/pumpkin-day/",
          venue: { venue: "Dallas Farmers Market", address: "920 S Harwood St", city: "Dallas", stateprovince: "TX", zip: "75201" },
        },
        { title: "All day", start_date: "2026-10-10 00:00:00", end_date: "2026-10-10 23:59:59", all_day: true, venue: [] },
      ],
    });
    expect(events[0]).toMatchObject({
      title: "Dallas' Original Pumpkin Day",
      event_date: "2026-10-03",
      start_time: "10:00",
      end_time: "16:00",
      address: "920 S Harwood St, Dallas, TX 75201",
      cost: "Free",
    });
    expect(events[1]).toMatchObject({ start_time: null, end_time: null, venue: null });
  });

  it("auto-detects a WordPress calendar from the page and paginates the API", async () => {
    const api = "https://market.example.org/wp-json/tribe/events/v1/events?start_date=2026-10-03&per_page=50&status=publish";
    const http = new FakeHttp({
      "https://market.example.org/events/": `<div class="tribe-events">Events</div>`,
      [api]: JSON.stringify({
        events: [{ title: "Kids Craft Day", start_date: "2026-10-10 10:00:00", timezone: "America/Chicago" }],
        next_rest_url: `${api}&page=2`,
      }),
      [`${api}&page=2`]: JSON.stringify({ events: [{ title: "Toddler Music", start_date: "2026-10-17 09:30:00" }] }),
    });
    const res = await runFeeder(
      { ...churchSource, url: "https://market.example.org/events/", is_church: false, group: "venue" },
      { http, extract: null, today: TODAY },
    );
    expect(res.feedersUsed).toEqual(["tribe"]);
    expect(res.candidates.map((c) => c.event.title)).toEqual(["Kids Craft Day", "Toddler Music"]);
    expect(res.candidates[0].event.city).toBe("Dallas"); // default_city fills the gap
  });
});

describe("discovery helpers", () => {
  it("finds advertised and Squarespace iCal feeds", () => {
    expect(findICalUrl(`<link rel="alternate" type="text/calendar" href="/events.ics">`, "https://a.org/x")).toBe("https://a.org/events.ics");
    expect(findICalUrl(`<a href="webcal://a.org/cal.ics">Subscribe</a>`, "https://a.org/")).toBe("https://a.org/cal.ics");
    expect(findICalUrl(`<img src="https://static1.squarespace.com/x.png">`, "https://park.org/events")).toBe("https://park.org/events?format=ical");
    expect(findICalUrl(`<p>nothing</p>`, "https://a.org/")).toBeNull();
  });

  it("discovers same-site event detail links only", () => {
    const html = `
      <a href="/events/fall-festival-2026/">Fall Festival</a>
      <a href="https://other.org/events/x">Other site</a>
      <a href="/events/category/kids/">Category</a>
      <a href="/about/">About</a>
      <a href="/events/flyer.pdf">Flyer</a>
      <a href="/christmas/living-nativity">Nativity</a>
      <a href="/events/fall-festival-2026/">Dup</a>`;
    expect(discoverEventLinks(html, "https://church.org/events/")).toEqual([
      "https://church.org/events/fall-festival-2026/",
      "https://church.org/christmas/living-nativity",
    ]);
  });

  it("chunks long text on line boundaries", () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n");
    const chunks = chunkText(text, 70);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n")).toBe(text);
  });

  it("parses age ranges", () => {
    expect(parseAgeRange("Perfect for ages 2-5")).toEqual({ age_min: 2, age_max: 5 });
    expect(parseAgeRange("ages 10+")).toEqual({ age_min: 10, age_max: null });
    expect(parseAgeRange("kids 5 and under free")).toEqual({ age_min: 0, age_max: 5 });
  });
});

describe("http client", () => {
  it("retries retryable statuses and honors Retry-After", async () => {
    const waits: number[] = [];
    let n = 0;
    const fetchImpl = (async (url: string) => {
      if (String(url).endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /private/", { status: 200 });
      n++;
      return n < 3 ? new Response("busy", { status: 429, headers: { "retry-after": "2" } }) : new Response("<p>ok</p>", { status: 200, headers: { etag: '"v1"' } });
    }) as typeof fetch;
    const http = createHttpClient({ fetch: fetchImpl, sleep: async (ms) => void waits.push(ms) });
    const res = await http.get("https://a.org/events");
    expect(res).toMatchObject({ status: "ok", body: "<p>ok</p>", etag: '"v1"' });
    expect(waits.filter((w) => w === 2000)).toHaveLength(2);
    expect(await http.get("https://a.org/private/x")).toEqual({ status: "blocked_by_robots", url: "https://a.org/private/x" });
  });

  it("does not retry a 404", async () => {
    let n = 0;
    const fetchImpl = (async (url: string) => {
      if (String(url).endsWith("/robots.txt")) return new Response("", { status: 404 });
      n++;
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    const http = createHttpClient({ fetch: fetchImpl, sleep: async () => {} });
    await expect(http.get("https://a.org/x")).rejects.toThrow("404");
    expect(n).toBe(1);
  });

  it("parses robots rules for us and wildcards", () => {
    const rules = parseRobots("User-agent: Googlebot\nDisallow: /g/\n\nUser-agent: *\nDisallow: /admin/\nDisallow: /*.pdf$\n");
    expect(rules).toEqual(["/admin/", "/*.pdf$"]);
    expect(isDisallowed(rules, "/admin/x")).toBe(true);
    expect(isDisallowed(rules, "/files/a.pdf")).toBe(true);
    expect(isDisallowed(rules, "/g/x")).toBe(false);
    expect(retryDelay(0, "5")).toBe(5000);
  });
});

describe("source health", () => {
  it("backs off exponentially, capped at two weeks", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(backoffDays)).toEqual([0, 1, 2, 4, 8, 14, 14]);
    const st = { id: "x", etag: null, last_modified: null, content_hash: null, last_run_at: "2026-10-01T11:00:00Z", last_success_at: null, consecutive_failures: 3, last_error: "x", last_feeders: [], last_event_count: null };
    expect(isDue(st, "2026-10-04")).toBe(false);
    expect(isDue(st, "2026-10-05")).toBe(true);
  });

  it("registry ids and URLs are unique and well-formed", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SOURCES.length).toBeGreaterThanOrEqual(45);
    for (const s of SOURCES) expect(() => new URL(s.url)).not.toThrow();
  });
});

describe("review enrichment", () => {
  it("adds verified ratings once per venue and refuses mismatched places", async () => {
    let calls = 0;
    const lookup = async (venue: string) => {
      calls++;
      return venue.includes("Arboretum") ? { rating: 4.8, review_count: 21000, source: "Google", url: null } : null;
    };
    const events = SEED_EVENTS.filter((e) => e.venue === "Dallas Arboretum and Botanical Garden");
    const res = await enrichWithReviews(events, lookup);
    expect(calls).toBe(1);
    expect(res.events.every((e) => e.review_count === 21000)).toBe(true);
    expect(namesMatch("Dallas Arboretum and Botanical Garden", "Dallas Arboretum & Botanical Garden")).toBe(true);
    expect(namesMatch("First Baptist Dallas", "Starbucks")).toBe(false);
  });
});

describe("rolling monthly sources", () => {
  it("expands month-templated guides for the current and next month", () => {
    const out = expandRollingSources(SOURCES.filter((s) => s.id === "eventbrite-dallas-month"), "2026-12-20");
    expect(out.map((s) => [s.id, s.url])).toEqual([
      ["eventbrite-dallas-month", "https://www.eventbrite.com/d/tx--dallas/december/"],
      ["eventbrite-dallas-month+1", "https://www.eventbrite.com/d/tx--dallas/january/"],
    ]);
  });
});

describe("instagram feeder", () => {
  const creds = { userId: "123", accessToken: "tok" };
  const url = businessDiscoveryUrl(creds, "dallasites101");

  it("reads public business posts and keeps recent ones with dates", async () => {
    const http = new FakeHttp({
      [url]: JSON.stringify({
        business_discovery: {
          media: {
            data: [
              { caption: "Fall fest Oct 24 at Klyde Warren! Free for families.", permalink: "https://instagram.com/p/a", timestamp: "2026-10-01T15:00:00+0000" },
              { caption: "Our favorite tacos", permalink: "https://instagram.com/p/b", timestamp: "2026-10-02T15:00:00+0000" },
              { caption: "Easter egg hunt April 4", permalink: "https://instagram.com/p/c", timestamp: "2026-04-01T15:00:00+0000" },
            ],
          },
        },
      }),
    });
    const posts = await fetchInstagramPosts(http, creds, "dallasites101");
    expect(posts).toHaveLength(3);
    expect(eventLikePosts(posts, "2026-10-05").map((p) => p.permalink)).toEqual(["https://instagram.com/p/a"]);
  });

  it("extracts events from posts with the post as the source link", async () => {
    const http = new FakeHttp({
      [url]: JSON.stringify({
        business_discovery: { media: { data: [{ caption: "Pumpkin storytime Oct 17 at 10am", permalink: "https://instagram.com/p/x", timestamp: "2026-10-03T12:00:00+0000" }] } },
      }),
    });
    const source = SOURCES.find((s) => s.id === "ig-dallasites101")!;
    const res = await runFeeder(source, {
      http,
      instagram: creds,
      today: "2026-10-05",
      extract: async ({ text }) => {
        expect(text).toContain("Pumpkin storytime Oct 17");
        return [];
      },
    });
    expect(res.pagesFetched).toBe(1);
    expect(res.notes).toEqual([]);
  });

  it("skips quietly when not configured", async () => {
    const source = SOURCES.find((s) => s.id === "ig-dallasites101")!;
    const res = await runFeeder(source, { http: new FakeHttp({}), extract: null, today: "2026-10-05" });
    expect(res.notes[0]).toContain("instagram not configured");
  });
});

describe("reddit feeder", () => {
  const listing = (posts: { title: string; selftext?: string; score: number; over_18?: boolean }[]) =>
    JSON.stringify({
      data: {
        children: posts.map((p, i) => ({
          data: { ...p, permalink: `/r/Dallas/comments/${i}/x/`, created_utc: Date.parse("2026-10-04T12:00:00Z") / 1000 },
        })),
      },
    });

  it("reads subreddit search with the bearer token and keeps upvoted posts that name a date", async () => {
    const url = subredditSearchUrl("Dallas");
    const http = new FakeHttp({
      [url]: listing([
        { title: "Free outdoor movie Oct 17 at Main Street Garden", selftext: "Bring blankets", score: 25 },
        { title: "Best tacos?", score: 80 },
        { title: "My band plays Oct 9", score: 1 },
        { title: "Party Oct 10", score: 50, over_18: true },
      ]),
    });
    const seen: string[] = [];
    const source = SOURCES.find((s) => s.id === "reddit-dallas")!;
    const res = await runFeeder(source, {
      http,
      today: "2026-10-05",
      redditToken: async () => "tok",
      extract: async ({ text }) => {
        seen.push(text);
        return [];
      },
    });
    expect(http.calls[0].opts?.authorization).toBe("Bearer tok");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("Free outdoor movie Oct 17");
    expect(res.feedersUsed).toEqual(["reddit"]);
  });

  it("filters low-signal posts", () => {
    const posts = [
      { title: "this weekend: Deep Ellum art walk", text: "", permalink: "p1", createdUtc: 0, score: 5 },
      { title: "Moving to Dallas, advice?", text: "", permalink: "p2", createdUtc: 0, score: 100 },
    ];
    expect(eventLikeRedditPosts(posts).map((p) => p.permalink)).toEqual(["p1"]);
  });

  it("skips quietly when not configured", async () => {
    const source = SOURCES.find((s) => s.id === "reddit-dallas")!;
    const res = await runFeeder(source, { http: new FakeHttp({}), extract: null, today: "2026-10-05" });
    expect(res.notes[0]).toContain("reddit not configured");
  });
});
