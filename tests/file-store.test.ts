import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeCollected } from "@/data/collected";
import { SEED_EVENTS } from "@/data/seed";
import { FileRepository, FileStateStore } from "@/lib/pipeline/file-store";
import { runPipeline } from "@/lib/pipeline/run";
import { withBudget } from "@/lib/pipeline/setup";
import { emptyState } from "@/lib/pipeline/state";
import { churchSource, extracted, FakeHttp, FALL_PAGE } from "./helpers";

describe("file store (git as the database)", () => {
  it("stores only events that differ from the seed and reads them back merged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dfc-"));
    const repo = new FileRepository(dir);
    expect((await repo.list()).length).toBe(SEED_EVENTS.length);

    const summary = await runPipeline({
      sources: [churchSource],
      extract: async () => [extracted({})],
      repo,
      state: new FileStateStore(dir),
      http: new FakeHttp({ [churchSource.url]: FALL_PAGE }),
      now: new Date("2026-10-05T12:00:00Z"),
    });
    expect(summary.published).toBe(1);

    const stored = JSON.parse(readFileSync(join(dir, "collected.json"), "utf8"));
    expect(stored.events.some((e: { title: string }) => e.title === "Fall Festival")).toBe(true);
    // Untouched seed events are not duplicated into the file.
    expect(stored.events.length).toBeLessThan(SEED_EVENTS.length);
    expect((await repo.list()).length).toBe(SEED_EVENTS.length + 1);

    const state = await new FileStateStore(dir).getAll();
    expect(state.get("test-church")?.last_success_at).toBeTruthy();
    expect(JSON.parse(readFileSync(join(dir, "last-run.json"), "utf8")).published).toBe(1);
  });

  it("lets a collected event override its seed version by id", () => {
    const seed = SEED_EVENTS.slice(0, 2);
    const updated = { ...seed[0], cost: "Free (updated)" };
    const merged = mergeCollected(seed, [updated]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.id === seed[0].id)?.cost).toBe("Free (updated)");
  });

  it("merges state across runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dfc-"));
    const store = new FileStateStore(dir);
    await store.putMany([{ ...emptyState("a"), consecutive_failures: 2 }]);
    await store.putMany([emptyState("b")]);
    expect([...(await store.getAll()).keys()]).toEqual(["a", "b"]);
  });
});

describe("AI call budget", () => {
  it("stops calling the model after the budget and reports once", async () => {
    let calls = 0;
    let exhausted = 0;
    const capped = withBudget(
      async () => {
        calls++;
        return [];
      },
      2,
      () => exhausted++,
    );
    for (let i = 0; i < 5; i++) await capped({ source: churchSource, text: "", today: "2026-10-05" });
    expect(calls).toBe(2);
    expect(exhausted).toBe(1);
  });
});
