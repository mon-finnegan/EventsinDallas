import { describe, expect, it } from "vitest";
import { SEED_EVENTS } from "@/data/seed";
import { buildCalendarItems, collapseRepeats, emptyDays, isExpired, pendingActions, topPick } from "@/lib/calendar";
import { monthGrid, splitActionAt, todayInDallas } from "@/lib/dates";
import { dedupe, normalizeTitle } from "@/lib/dedupe";
import { DEFAULT_PREFERENCES, matchesPreferences } from "@/lib/filters";
import { assessRelevance, isGrownUpOuting } from "@/lib/relevance";
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
    const calendar = make({ id: "b", title: "Pumpkinfest 2026", source_type: "local_calendar", cost: "Free!" });
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
  it("church toggle hides church-hosted events", () => {
    expect(matchesPreferences(base, DEFAULT_PREFERENCES)).toBe(true);
    expect(matchesPreferences(base, { ...DEFAULT_PREFERENCES, church: false })).toBe(false);
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
    expect(SEED_EVENTS.filter((e) => e.subcategory === "sports").length).toBeLessThanOrEqual(12);
  });

  it("treats adults-only food and music nights as grown-up outings, not kids' events", () => {
    const whiskey = SEED_EVENTS.find((e) => e.id === "whiskey-washback-dallas-2026")!;
    expect(isGrownUpOuting(whiskey)).toBe(true);
    const r = assessRelevance(whiskey);
    expect(r.include).toBe(true);
    expect(r.reasons).not.toContain("designed for older children");
    expect(matchesPreferences(whiskey, { ...DEFAULT_PREFERENCES, grownup: false })).toBe(false);
  });

  it("still excludes programs for older kids", () => {
    expect(assessRelevance(make({ age_min: 8, is_toddler_relevant: false, is_church_hosted: false })).include).toBe(false);
  });
});
