import { getRepository, getServiceClient } from "../repository";
import { createClaudeExtractor } from "./extract";
import { redditToken } from "./feeders/reddit";
import { createGooglePlacesLookup } from "./reviews";
import type { PipelineOptions } from "./run";
import { SOURCES, type Source } from "./sources";
import { MemoryStateStore, SupabaseStateStore } from "./state";

/** Production wiring shared by the cron route and the CLI. */
export function productionOptions(overrides: Partial<PipelineOptions> & { sources?: Source[] } = {}): PipelineOptions {
  const client = getServiceClient();
  return {
    sources: SOURCES,
    extract: process.env.ANTHROPIC_API_KEY ? createClaudeExtractor() : null,
    repo: getRepository({ write: true }),
    state: client ? new SupabaseStateStore(client) : new MemoryStateStore(),
    instagram:
      process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN
        ? { userId: process.env.IG_USER_ID, accessToken: process.env.IG_ACCESS_TOKEN }
        : null,
    redditToken:
      process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
        ? () => redditToken({ clientId: process.env.REDDIT_CLIENT_ID!, clientSecret: process.env.REDDIT_CLIENT_SECRET! })
        : null,
    reviews: process.env.GOOGLE_PLACES_API_KEY ? createGooglePlacesLookup(process.env.GOOGLE_PLACES_API_KEY) : null,
    ...overrides,
  };
}
