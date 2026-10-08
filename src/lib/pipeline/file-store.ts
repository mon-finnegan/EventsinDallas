import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_EVENTS } from "@/data/seed";
import { mergeCollected } from "@/data/collected";
import type { EventRepository } from "../repository";
import type { CalendarEvent } from "../types";
import type { Source } from "./sources";
import type { SourceState, SourceStateStore } from "./state";

// "Git as the database": the daily GitHub Actions run reads and writes these JSON files and
// commits them; Vercel redeploys on the push. No database or extra service needed.

const DATA_DIR = join(process.cwd(), "src", "data");

function readJson<T>(dir: string, file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(dir, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(dir: string, file: string, value: unknown) {
  writeFileSync(join(dir, file), JSON.stringify(value, null, 2) + "\n");
}

const stable = (e: CalendarEvent) => JSON.stringify(e, Object.keys(e).sort());

export class FileRepository implements EventRepository {
  constructor(
    private dir = DATA_DIR,
    private file = "collected.json",
  ) {}

  async list() {
    const found = readJson<{ events: CalendarEvent[] }>(this.dir, this.file, { events: [] }).events;
    return mergeCollected(SEED_EVENTS, found);
  }

  /** Store only what differs from the hand-researched seed, keeping the file small and reviewable. */
  async upsert(events: CalendarEvent[]) {
    const seedById = new Map(SEED_EVENTS.map((e) => [e.id, stable(e)]));
    const changed = events
      .filter((e) => seedById.get(e.id) !== stable(e))
      .sort((a, b) => (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999") || a.id.localeCompare(b.id));
    writeJson(this.dir, this.file, { updated_at: new Date().toISOString(), events: changed });
  }

  async logRun(summary: unknown) {
    writeJson(this.dir, "last-run.json", summary);
  }
}

export class FileStateStore implements SourceStateStore {
  constructor(
    private dir = DATA_DIR,
    private file = "source-state.json",
  ) {}

  async getAll() {
    const states = readJson<{ states: SourceState[] }>(this.dir, this.file, { states: [] }).states;
    return new Map(states.map((s) => [s.id, s]));
  }

  async putMany(states: SourceState[], _registry?: Source[]) {
    void _registry;
    const merged = await this.getAll();
    for (const s of states) merged.set(s.id, s);
    writeJson(this.dir, this.file, { states: [...merged.values()].sort((a, b) => a.id.localeCompare(b.id)) });
  }
}

/** Pages found by national discovery, kept so later runs keep re-verifying them. */
export interface DiscoveredEntry {
  source: Source;
  discovered_at: string;
}

const DISCOVERY_TTL_DAYS = 90;

/** Add newly found pages and drop ones older than the retention window. */
export function mergeDiscovered(existing: DiscoveredEntry[], found: Source[], today: string): DiscoveredEntry[] {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - DISCOVERY_TTL_DAYS);
  const keep = existing.filter((e) => e.discovered_at >= cutoff.toISOString().slice(0, 10));
  const have = new Set(keep.map((e) => e.source.url));
  for (const s of found) if (!have.has(s.url)) keep.push({ source: s, discovered_at: today });
  return keep;
}

export class DiscoveredSourceStore {
  constructor(
    private dir = DATA_DIR,
    private file = "discovered-sources.json",
  ) {}
  load(): DiscoveredEntry[] {
    return readJson<{ sources: DiscoveredEntry[] }>(this.dir, this.file, { sources: [] }).sources;
  }
  save(entries: DiscoveredEntry[]) {
    writeJson(this.dir, this.file, { sources: entries });
  }
}
