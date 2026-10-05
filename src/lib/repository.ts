import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { allBundledEvents } from "@/data/collected";
import type { CalendarEvent } from "./types";
import { validateForPublish } from "./validation";

// Storage is behind this small interface so the app stays portable (spec §32):
// Supabase when configured; otherwise the bundled data — the hand-researched seed plus whatever
// the daily GitHub Actions batch collected (src/data/collected.json).

export interface EventRepository {
  list(): Promise<CalendarEvent[]>;
  upsert(events: CalendarEvent[]): Promise<void>;
  /** Persist a pipeline run summary for auditing (optional). */
  logRun?(summary: unknown): Promise<void>;
}

class SeedRepository implements EventRepository {
  async list() {
    return allBundledEvents();
  }
  async upsert(): Promise<void> {
    throw new Error("Seed repository is read-only. Configure Supabase to persist pipeline results.");
  }
}

/** Postgres returns "HH:MM:SS" for time columns; the app uses "HH:MM". */
function fromRow(row: Record<string, unknown>): CalendarEvent {
  const t = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
  return {
    ...(row as unknown as CalendarEvent),
    start_time: t(row.start_time),
    end_time: t(row.end_time),
    activities: (row.activities as string[] | null) ?? [],
    open_daily: Boolean(row.open_daily),
    closed_dates: (row.closed_dates as string[] | null) ?? [],
  };
}

class SupabaseRepository implements EventRepository {
  constructor(private client: SupabaseClient) {}

  async list() {
    const { data, error } = await this.client.from("events").select("*");
    if (error) throw new Error(`Supabase list failed: ${error.message}`);
    return (data ?? []).map(fromRow);
  }

  async upsert(events: CalendarEvent[]) {
    // Batches keep each request small as feeders multiply.
    for (let i = 0; i < events.length; i += 500) {
      const { error } = await this.client.from("events").upsert(events.slice(i, i + 500), { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    }
  }

  async logRun(summary: unknown) {
    const s = summary as { started_at: string; finished_at: string };
    const { error } = await this.client
      .from("pipeline_runs")
      .insert({ started_at: s.started_at, finished_at: s.finished_at, summary });
    if (error) console.warn(`[pipeline] run log failed: ${error.message}`);
  }
}

/** Supabase client with the service-role key, or null when not configured. */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export function getRepository(opts: { write?: boolean } = {}): EventRepository {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = opts.write
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (url && key) {
    return new SupabaseRepository(createClient(url, key, { auth: { persistSession: false } }));
  }
  return new SeedRepository();
}

/** Events that pass the publishing gate; anything invalid is withheld and logged. */
export async function getPublishedEvents(): Promise<CalendarEvent[]> {
  const raw = await getRepository().list();
  const out: CalendarEvent[] = [];
  for (const e of raw) {
    const res = validateForPublish(e);
    if (res.ok) out.push(res.event);
    else console.warn(`[events] withheld ${e.id}: ${res.errors.join("; ")}`);
  }
  return out;
}
