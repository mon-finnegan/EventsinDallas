import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { SEED_EVENTS } from "@/data/seed";
import { DEFAULT_PREFERENCES, matchesPreferences } from "@/lib/filters";
import { discoveredSource, pickDiscoveredUrls } from "@/lib/pipeline/discover-national";
import { guessNationalInterest } from "@/lib/pipeline/feeders/classify";
import { mergeDiscovered } from "@/lib/pipeline/file-store";
import { SOURCES } from "@/lib/pipeline/sources";
import { assessRelevance, curateByWeek } from "@/lib/relevance";

const searchResult = (url: string) =>
  ({ type: "web_search_result", url, title: "t", encrypted_content: "x", page_age: null }) as never;

describe("national discovery", () => {
  it("keeps only URLs that appeared in search results", () => {
    const content = [
      {
        type: "web_search_tool_result",
        tool_use_id: "t1",
        content: [searchResult("https://www.nps.gov/whho/planyourvisit/national-christmas-tree.htm"), searchResult("https://www.kentuckyderby.com/tickets/2027/")],
      },
      {
        type: "text",
        text: [
          "URL: https://nps.gov/whho/planyourvisit/national-christmas-tree.htm",
          "URL: https://www.kentuckyderby.com/tickets/2027/.",
          "URL: https://made-up.example.com/lottery",
        ].join("\n"),
        citations: null,
      },
    ] as unknown as Anthropic.Beta.BetaContentBlock[];
    expect(pickDiscoveredUrls(content)).toEqual([
      "https://nps.gov/whho/planyourvisit/national-christmas-tree.htm",
      "https://www.kentuckyderby.com/tickets/2027/",
    ]);
  });

  it("turns a found page into a national source and keeps it for 90 days", () => {
    const s = discoveredSource("https://www.nps.gov/whho/planyourvisit/calendar.htm");
    expect(s).toMatchObject({ group: "national", is_national: true, source_type: "official_municipal" });
    const kept = mergeDiscovered([{ source: s, discovered_at: "2026-06-01" }], [s], "2026-10-08");
    expect(kept).toEqual([{ source: s, discovered_at: "2026-10-08" }]);
    expect(mergeDiscovered(kept, [s], "2026-10-09")).toHaveLength(1);
  });

  it("tracks official selective-access pages", () => {
    const ids = SOURCES.filter((s) => s.is_national).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["nps-national-christmas-tree", "nps-wh-garden-tours", "whitehouse-visit", "aoc-capitol-tree"]));
  });
});

describe("exclusive access", () => {
  it("is recognized from feed text", () => {
    expect(guessNationalInterest("White House Fall Garden Tours")).toBe("exclusive_access");
    expect(guessNationalInterest("National Christmas Tree Lighting ticket lottery")).toBe("exclusive_access");
    expect(guessNationalInterest("Masters ticket lottery")).toBe("golf");
  });

  it("shows for viewers whose saved preferences predate the category", () => {
    const tours = SEED_EVENTS.find((e) => e.id === "white-house-fall-garden-tours-2026")!;
    const saved = { ...DEFAULT_PREFERENCES, nationalInterests: { golf: true, major_sports: true, olympics: true, special_experiences: true } };
    expect(matchesPreferences(tours, saved as typeof DEFAULT_PREFERENCES)).toBe(true);
    expect(matchesPreferences(tours, { ...DEFAULT_PREFERENCES, nationalInterests: { ...DEFAULT_PREFERENCES.nationalInterests, exclusive_access: false } })).toBe(false);
  });

  it("is never cut by the weekly volume cap", () => {
    const tours = SEED_EVENTS.find((e) => e.id === "white-house-fall-garden-tours-2026")!;
    const filler = Array.from({ length: 30 }, (_, i) => ({ ...tours, id: `f${i}`, scope: "DALLAS" as const, national_interest: null }));
    const { kept } = curateByWeek([...filler, tours], () => 1, 5);
    expect(kept.map((e) => e.id)).toContain(tours.id);
    expect(assessRelevance(tours).reasons).toContain("selective public access");
  });
});
