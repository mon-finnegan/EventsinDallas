import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysBetween } from "../dates";
import type { FeederKind, Source } from "./sources";

// Per-source health and caching state. Lets the daily run:
//  - send conditional GETs (ETag / Last-Modified) and skip unchanged pages
//  - back off from failing sources (1, 2, 4, 8, 14 days) instead of hammering them
//  - report which feeders are healthy

export interface SourceState {
  id: string;
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  last_feeders: FeederKind[];
  last_event_count: number | null;
}

export const emptyState = (id: string): SourceState => ({
  id,
  etag: null,
  last_modified: null,
  content_hash: null,
  last_run_at: null,
  last_success_at: null,
  consecutive_failures: 0,
  last_error: null,
  last_feeders: [],
  last_event_count: null,
});

export interface SourceStateStore {
  getAll(): Promise<Map<string, SourceState>>;
  /** `registry` supplies the source's descriptive columns for stores that persist them. */
  putMany(states: SourceState[], registry?: Source[]): Promise<void>;
}

export class MemoryStateStore implements SourceStateStore {
  states = new Map<string, SourceState>();
  async getAll() {
    return new Map(this.states);
  }
  async putMany(states: SourceState[]) {
    for (const s of states) this.states.set(s.id, s);
  }
}

export class SupabaseStateStore implements SourceStateStore {
  constructor(private client: SupabaseClient) {}
  async getAll() {
    const { data, error } = await this.client
      .from("sources")
      .select("id, etag, last_modified, content_hash, last_run_at, last_success_at, consecutive_failures, last_error, last_feeders, last_event_count");
    if (error) throw new Error(`Supabase sources read failed: ${error.message}`);
    return new Map((data ?? []).map((r) => [r.id as string, { ...emptyState(r.id as string), ...r, last_feeders: r.last_feeders ?? [] } as SourceState]));
  }
  async putMany(states: SourceState[], registry: Source[] = []) {
    const byId = new Map(registry.map((s) => [s.id, s]));
    const rows = states.map((st) => {
      const src = byId.get(st.id);
      return src
        ? {
            ...st,
            name: src.name,
            url: src.url,
            source_type: src.source_type,
            group: src.group,
            feeder: src.feeder ?? "auto",
            feed_url: src.feed_url ?? null,
            default_city: src.default_city ?? null,
            max_detail_pages: src.max_detail_pages ?? null,
            is_church: src.is_church,
            kind: src.is_national ? "national" : src.group,
          }
        : st;
    });
    const { error } = await this.client.from("sources").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Supabase sources write failed: ${error.message}`);
  }
}

/** Days to wait after `n` consecutive failures. */
export function backoffDays(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(2 ** (failures - 1), 14);
}

/** Should this source be attempted today? */
export function isDue(state: SourceState | undefined, today: string): boolean {
  if (!state || state.consecutive_failures === 0 || !state.last_run_at) return true;
  const resumeOn = addDays(state.last_run_at.slice(0, 10), backoffDays(state.consecutive_failures));
  return today >= resumeOn;
}

/** Cached validators are trusted for a week; after that we re-read fully to re-verify. */
export function isFresh(state: SourceState | undefined, today: string): boolean {
  if (!state?.last_success_at) return false;
  return daysBetween(state.last_success_at.slice(0, 10), today) < 7;
}
