import { getRepository, getServiceClient } from "../repository";
import { createClaudeExtractor, type Extractor } from "./extract";
import { FileRepository, FileStateStore } from "./file-store";
import { redditToken } from "./feeders/reddit";
import { createGooglePlacesLookup } from "./reviews";
import type { PipelineOptions } from "./run";
import { SOURCES, type Source } from "./sources";
import { MemoryStateStore, SupabaseStateStore } from "./state";

/**
 * Cap AI extraction calls per run so a large crawl can't run up the API bill. Further calls are
 * skipped (the source is retried on the next day's run, when unchanged pages cost nothing).
 */
export function withBudget(extract: Extractor, maxCalls: number, onExhausted: () => void): Extractor {
  let calls = 0;
  let warned = false;
  return async (args) => {
    if (calls >= maxCalls) {
      if (!warned) onExhausted();
      warned = true;
      return [];
    }
    calls++;
    return extract(args);
  };
}

/**
 * Production wiring shared by the cron route and the CLI.
 * store "supabase" when configured; "file" commits results into the repo (GitHub Actions);
 * "memory" for dry runs.
 */
export function productionOptions(
  overrides: Partial<PipelineOptions> & { sources?: Source[]; store?: "supabase" | "file" | "memory" } = {},
): PipelineOptions {
  const client = getServiceClient();
  const store = overrides.store ?? (client ? "supabase" : "file");
  const budget = Number(process.env.AI_CALL_BUDGET ?? 150);
  const extract = process.env.ANTHROPIC_API_KEY
    ? withBudget(createClaudeExtractor(), budget, () =>
        console.error(`[pipeline] AI call budget of ${budget} reached; remaining AI sources wait for tomorrow.`),
      )
    : null;
  const { store: _store, ...rest } = overrides;
  void _store;
  return {
    sources: SOURCES,
    extract,
    repo: store === "file" ? new FileRepository() : getRepository({ write: true }),
    state: store === "supabase" && client ? new SupabaseStateStore(client) : store === "file" ? new FileStateStore() : new MemoryStateStore(),
    instagram:
      process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN
        ? { userId: process.env.IG_USER_ID, accessToken: process.env.IG_ACCESS_TOKEN }
        : null,
    redditToken:
      process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
        ? () => redditToken({ clientId: process.env.REDDIT_CLIENT_ID!, clientSecret: process.env.REDDIT_CLIENT_SECRET! })
        : null,
    reviews: process.env.GOOGLE_PLACES_API_KEY ? createGooglePlacesLookup(process.env.GOOGLE_PLACES_API_KEY) : null,
    ...rest,
  };
}
