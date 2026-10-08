import { describe, expect, it } from "vitest";
import { SEED_EVENTS } from "@/data/seed";
import { admissionChip, buildCalendarItems, collapseRepeats, emptyDays, isExpired, pendingActions, topPick } from "@/lib/calendar";
import { monthGrid, splitActionAt, todayInDallas } from "@/lib/dates";
import { dedupe, normalizeTitle } from "@/lib/dedupe";
import { DEFAULT_PREFERENCES, matchesPreferences } from "@/lib/filters";
import { assessRelevance, isThirtyPlusActivity } from "@/lib/relevance";
import type { CalendarEvent } from "@/lib/types";
import { validateForPublish } from "@/lib/validation";

const base = SEED_EVENTS.find((e) => e.id === "prestoncrest-pumpkinfest-2026")!;
const make = (patch: Partial<CalendarEvent>): CalendarEvent => ({ ...base, ...patch });

describe("seed data", () => {
  it("every seed record passes the publishing gate", () => {
    for (const e of SEED_EVENTS) {
      const res = validateForPublish(e);
      expect(res.ok ? [] : res.errors, e.id).toEqual([]);
    }
  });

  it("has unique ids and every record links to a source", () => {
    const ids = SEED_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SEED_EVENTS) expect(e.source_url).toMatch(/^https:\/\//);
  });
});

describe("validation (no guessing)", () => {
  it("rejects a Dallas event with no date", () => {
    const res = validateForPublish(make({ event_date: null }));
    expect(res.ok).toBe(false);
  });

  it("allows a signup alert whose action date is explicitly unknown", () => {
    const res = validateForPublish(
      make({ category: "SIGNUP_ALERT", event_date: null, signup_required: true, signup_type: "RESERVATION" }),
    );
    expect(res.ok).toBe(true);
  });

  it("rejects a signup alert without an action type", () => {
    const res = validateForPublish(make({ category: "SIGNUP_ALERT", event_date: null, signup_required: true }));
    expect(res.ok).toBe(false);
  });

  it("rejects impossible dates and ambiguous timestamps", () => {
    expect(validateForPublish(make({ event_date: "2026-02-30" })).ok).toBe(false);
    expect(validateForPublish(make({ signup_type: "RESERVATION", signup_required: true, signup_open_at: "2026-10-08T10:00" })).ok).toBe(false);
    expect(validateForPublish(make({ signup_type: "RESERVATION", signup_required: true, signup_open_at: "2026-10-08T10:00:00-05:00" })).ok).toBe(true);
  });

  it("rejects non-public church events", () => {
    expect(validateForPublish(make({ is_public_event: false })).ok).toBe(false);
  });
});

describe("reverse calendar", () => {
  it("creates a red item on the action date, separate from the event date", () => {
    const tea = make({
      id: "tea",
      title: "Christmas Tea",
      category: "DALLAS_EVENT",
      event_date: "2026-12-12",
      signup_required: true,
      signup_type: "RESERVATION",
      signup_open_at: "2026-10-08T10:00:00-05:00",
    });
    const items = buildCalendarItems([tea]);
    const red = items.find((i) => i.color === "red")!;
    expect(red.date).toBe("2026-10-08");
    expect(red.time).toBe("10:00");
    expect(red.label).toBe("Reservations open: Christmas Tea");
    expect(items.find((i) => i.color === "blue")!.date).toBe("2026-12-12");
  });

  it("keeps date-only actions without inventing a time", () => {
    expect(splitActionAt("2026-10-15")).toEqual({ date: "2026-10-15", time: null });
    const zoo = SEED_EVENTS.find((e) => e.id === "dallas-zoo-lights-2026")!;
    const red = buildCalendarItems([zoo]).find((i) => i.color === "red")!;
    expect(red).toMatchObject({ date: "2026-10-15", time: null });
  });

  it("shows every multi-day event once, on its first day", () => {
    const greek = SEED_EVENTS.find((e) => e.id === "greek-food-festival-dallas-2026")!;
    const g = buildCalendarItems([greek]);
    expect(g.map((i) => [i.date, i.label])).toEqual([["2026-11-06", "First day: Greek Food Festival of Dallas"]]);
    const rudolph = SEED_EVENTS.find((e) => e.id === "dct-rudolph-2026")!;
    const t = buildCalendarItems([rudolph]);
    expect(t).toHaveLength(1);
    expect(t[0].isOpeningDay).toBe(true);
  });

  it("lists signup-required events with no confirmed date as pending", () => {
    const pending = pendingActions(SEED_EVENTS, "2026-10-03").map((e) => e.id);
    expect(pending).toContain("french-room-holiday-tea-2026");
    expect(pending).not.toContain("dallas-zoo-lights-2026");
  });
});

describe("expiry", () => {
  it("hides past events but keeps today's", () => {
    expect(isExpired(make({ event_date: "2026-10-02", end_date: "2026-10-04" }), "2026-10-04")).toBe(false);
    expect(isExpired(make({ event_date: "2026-10-02", end_date: "2026-10-04" }), "2026-10-05")).toBe(true);
  });
});

describe("dedupe", () => {
  it("normalizes years and ordinal annual prefixes", () => {
    expect(normalizeTitle("27th Annual Lebanese Food Festival 2026")).toBe("lebanese food festival");
  });

  it("collapses duplicates and prefers the official source", () => {
    const official = make({ id: "a", source_type: "official_organization", cost: null });
    const calendar = make({ id: "b", title: "Pumpkinfest 2026", source_type: "local_calendar", source_name: "DFW Child", cost: "Free!" });
    const out = dedupe([calendar, official]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
    expect(out[0].cost).toBe("Free!"); // null filled from the duplicate's verified value
  });
});

describe("relevance", () => {
  it("excludes ordinary church programming", () => {
    const r = assessRelevance(make({ title: "Wednesday Bible Study", description: null, activities: [] }));
    expect(r.include).toBe(false);
  });

  it("includes a public church fall festival", () => {
    expect(assessRelevance(base).include).toBe(true);
  });

  it("excludes events designed for older kids", () => {
    const r = assessRelevance(make({ age_min: 10, is_toddler_relevant: false, is_church_hosted: false }));
    expect(r.include).toBe(false);
  });
});

describe("preferences", () => {
  it("shows an event when any of its categories is on", () => {
    // `base` is a church-hosted toddler festival: reachable from either filter.
    expect(matchesPreferences(base, DEFAULT_PREFERENCES)).toBe(true);
    expect(matchesPreferences(base, { ...DEFAULT_PREFERENCES, church: false })).toBe(true);
    expect(matchesPreferences(base, { ...DEFAULT_PREFERENCES, church: false, toddler: false })).toBe(false);
  });

  it("networking and 30+ filters work on their own", () => {
    const none = Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map((k) => [k, false])) as unknown as typeof DEFAULT_PREFERENCES;
    const only = (k: keyof typeof DEFAULT_PREFERENCES) => ({ ...none, nationalInterests: DEFAULT_PREFERENCES.nationalInterests, [k]: true });
    const networking = SEED_EVENTS.filter((e) => e.subcategory === "networking");
    expect(networking.length).toBeGreaterThan(0);
    for (const e of networking) expect(matchesPreferences(e, only("networking"))).toBe(true);
    const whiskey = SEED_EVENTS.find((e) => isThirtyPlusActivity(e))!;
    expect(matchesPreferences(whiskey, only("thirtyPlus"))).toBe(true);
    expect(matchesPreferences(whiskey, only("toddler"))).toBe(false);
  });

  it("national interest toggles filter national items", () => {
    const usOpen = SEED_EVENTS.find((e) => e.id === "us-open-2027-tickets")!;
    const prefs = { ...DEFAULT_PREFERENCES, nationalInterests: { ...DEFAULT_PREFERENCES.nationalInterests, golf: false } };
    expect(matchesPreferences(usOpen, prefs)).toBe(false);
  });
});

describe("dates", () => {
  it("builds a Sunday-first month grid", () => {
    const grid = monthGrid("2026-10");
    expect(grid[0][0]).toBe("2026-09-27"); // Sunday
    expect(grid[0][4]).toBe("2026-10-01"); // Thursday
    expect(grid[0][6]).toBe("2026-10-03"); // Saturday
    expect(grid.at(-1)!.at(-1)! >= "2026-10-31").toBe(true);
  });

  it("computes today in Dallas, not UTC", () => {
    // 03:00 UTC on Oct 4 is still Oct 3 in Dallas (CDT, UTC-5).
    expect(todayInDallas(new Date("2026-10-04T03:00:00Z"))).toBe("2026-10-03");
  });
});

describe("don't miss lists", () => {
  it("does not list an already-open signup as pending", () => {
    const pending = pendingActions(SEED_EVENTS, "2026-10-03").map((e) => e.id);
    expect(pending).not.toContain("us-open-2027-tickets");
  });
});

describe("no repeats and best-first", () => {
  it("lists a long daily run once, on its start day only", () => {
    const fair = SEED_EVENTS.find((e) => e.id === "state-fair-of-texas-2026")!;
    const items = buildCalendarItems([fair]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ date: "2026-09-25", isOpeningDay: true, label: "First day: State Fair of Texas" });
  });

  it("collapses a repeated event to its next date and keeps the other dates", () => {
    const storytimes = SEED_EVENTS.filter((e) => e.title === "Storytime at the NorthPark Pumpkin Patch");
    expect(storytimes.length).toBe(5);
    const items = collapseRepeats(buildCalendarItems(storytimes), "2026-10-05");
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe("2026-10-10");
    expect(items[0].otherDates).toEqual(["2026-10-03", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("never collapses separate games or action dates", () => {
    const game = SEED_EVENTS.find((e) => e.id === "cowboys-2026-10-08")!;
    const rematch = { ...game, id: "rematch", event_date: "2026-12-06" };
    expect(collapseRepeats(buildCalendarItems([game, rematch]), "2026-10-05")).toHaveLength(2);
  });

  it("shows no event title twice in a month", () => {
    const items = collapseRepeats(buildCalendarItems(SEED_EVENTS), "2026-10-05").filter(
      (i) => !i.action && i.event.subcategory !== "sports" && i.date.startsWith("2026-10"),
    );
    const titles = items.map((i) => i.event.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("picks a top event per day", () => {
    const items = buildCalendarItems(SEED_EVENTS).filter((i) => i.date === "2026-12-05");
    const pick = topPick(items)!;
    expect(pick.color).not.toBe("red");
  });

  it("reports empty days for the rolling coverage check", () => {
    expect(emptyDays(buildCalendarItems([]), "2026-10-05", "2026-10-06")).toEqual(["2026-10-05", "2026-10-06"]);
  });
});

describe("audience and sports", () => {
  it("keeps only major games", () => {
    const tnf = SEED_EVENTS.find((e) => e.id === "cowboys-2026-10-08")!;
    expect(assessRelevance(tnf).include).toBe(true);
    expect(assessRelevance({ ...tnf, title: "Cowboys vs. Arizona Cardinals" }).include).toBe(false);
    // Local games stay limited to marquee dates (national bowls and the Super Bowl are counted separately).
    expect(SEED_EVENTS.filter((e) => e.subcategory === "sports" && e.scope === "DALLAS").length).toBeLessThanOrEqual(12);
  });

  it("treats adults-only food and music nights as activities for 30+ year-olds, not kids' events", () => {
    const whiskey = SEED_EVENTS.find((e) => e.id === "whiskey-washback-dallas-2026")!;
    expect(isThirtyPlusActivity(whiskey)).toBe(true);
    const r = assessRelevance(whiskey);
    expect(r.include).toBe(true);
    expect(r.reasons).not.toContain("designed for older children");
    expect(matchesPreferences(whiskey, { ...DEFAULT_PREFERENCES, thirtyPlus: false })).toBe(false);
  });

  it("still excludes programs for older kids", () => {
    expect(assessRelevance(make({ age_min: 8, is_toddler_relevant: false, is_church_hosted: false })).include).toBe(false);
  });
});

describe("collection quality", () => {
  it("rejects church calendar filler but keeps community events", () => {
    const filler = ["Women's Bible Study", "AWANA", "Life Recovery Group", "Kids Worship", "Pray Worship Pray – Wednesday Night Prayer", "Estudio Bíblico del libro de Éxodo", "Discipleship University", "First Dallas Business Meeting", "Men's Softball"];
    for (const title of filler) {
      expect(assessRelevance(make({ title, description: null, activities: [] })).include, title).toBe(false);
    }
    expect(assessRelevance(make({ title: "Fall Fest", description: null, activities: [] })).include).toBe(true);
    expect(assessRelevance(make({ title: "OLPH Fall Festival", description: null, activities: [] })).include).toBe(true);
  });

  it("drops members-only programming", () => {
    expect(assessRelevance(make({ title: "Early Morning Member Walks", is_church_hosted: false })).include).toBe(false);
  });

  it("merges same-day listings of one event under different names", () => {
    const seed = SEED_EVENTS.find((e) => e.id === "first-baptist-dallas-fall-fest-2026")!;
    const fromFeed = { ...seed, id: "feed", title: "Fall Fest", source_type: "official_organization" as const, venue: "First Baptist Dallas" };
    expect(dedupe([seed, fromFeed])).toHaveLength(1);
    const other = { ...seed, id: "other", title: "Trunk or Treat Night" };
    expect(dedupe([seed, other])).toHaveLength(2);
  });

  it("keeps the researched adult picks", () => {
    for (const id of ["whiskey-washback-dallas-2026", "fright-crawl-dallas-2026", "grandscape-diwali-2026", "oktoberfest-southlake-2026"]) {
      expect(assessRelevance(SEED_EVENTS.find((e) => e.id === id)!).include, id).toBe(true);
    }
  });
});

describe("cross-source matching", () => {
  const armenia = SEED_EVENTS.find((e) => e.id === "armenia-fest-2026")!;
  it("matches spacing variants and guide-appended dates", async () => {
    const { sameTitle } = await import("@/lib/dedupe");
    expect(sameTitle("ArmeniaFest 2026 – Oct 16, 17 & 18", "Armenia Fest")).toBe(true);
    expect(sameTitle("31st Annual Armenia Fest", "Armenia Fest")).toBe(true);
    expect(sameTitle("Pumpkin Day", "Pumpkin Patch")).toBe(false);
  });
  it("folds single-day guide listings into the multi-day event", () => {
    const day2 = { ...armenia, id: "guide-day2", title: "ArmeniaFest 2026 – Oct 16, 17 & 18", event_date: "2026-10-17", end_date: null, source_name: "Dallas Moms" };
    expect(dedupe([armenia, day2]).map((e) => e.id)).toEqual([armenia.id]);
  });
  it("a newer read of the same source does not inherit stale values", () => {
    const old = { ...armenia, start_time: "05:00", last_verified_at: "2026-10-04T00:00:00Z" };
    const fresh = { ...armenia, start_time: null, last_verified_at: "2026-10-05T00:00:00Z" };
    expect(dedupe([fresh, old])[0].start_time).toBeNull();
  });
  it("gates games from any feed and skips watch parties", () => {
    const tnf = SEED_EVENTS.find((e) => e.id === "cowboys-2026-10-08")!;
    expect(assessRelevance({ ...tnf, subcategory: "sports", title: "NBA Cup: Dallas Mavericks vs. Houston Rockets" }).include).toBe(true);
    expect(assessRelevance({ ...tnf, subcategory: null, title: "Dallas Cowboys Watch Party: Cowboys vs Texans" }).include).toBe(false);
  });
});

describe("admission chip", () => {
  it("summarizes stated prices and never invents one", () => {
    expect(admissionChip(null)).toBeNull();
    expect(admissionChip("Free")).toBe("Free");
    expect(admissionChip("Free admission and parking; food for purchase")).toBe("Free");
    expect(admissionChip("$11.25; kids under 10 free")).toBe("$11.25");
    expect(admissionChip("Adults $15 weekdays / $25 weekends; kids 3–12 $10")).toBe("From $10");
    expect(admissionChip("Varies by night; combo day+night tickets available")).toBeNull();
  });
});
