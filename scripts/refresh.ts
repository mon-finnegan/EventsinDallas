// Run the daily pipeline outside Vercel (GitHub Actions, local).
//
//   npm run refresh                         all due sources
//   npm run refresh -- klyde-warren perot   only these source ids
//   npm run refresh -- --group church       one group (church, venue, civic, …)
//   npm run refresh -- --dry-run            fetch + extract, write nothing
//   npm run refresh -- --force              ignore backoff and cached validators
//   npm run refresh -- --store file         save to src/data/*.json (the GitHub Actions default)
//   npm run refresh -- --discover           run national discovery now (it runs on Sundays otherwise)
//
// Storage: Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise the JSON
// files in src/data (committed by the daily workflow). Optional keys: ANTHROPIC_API_KEY (AI
// extraction), REDDIT_CLIENT_ID/SECRET, IG_USER_ID/IG_ACCESS_TOKEN, GOOGLE_PLACES_API_KEY.
import { todayInDallas, weekdaySun0 } from "../src/lib/dates";
import { createNationalDiscovery } from "../src/lib/pipeline/discover-national";
import { DiscoveredSourceStore, mergeDiscovered } from "../src/lib/pipeline/file-store";
import { runPipeline } from "../src/lib/pipeline/run";
import { productionOptions } from "../src/lib/pipeline/setup";
import { SOURCES, type Source } from "../src/lib/pipeline/sources";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const group = valueOf("--group");
const storeArg = valueOf("--store");
const valueIdx = new Set(["--group", "--store"].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
const ids = args.filter((a, i) => !a.startsWith("--") && !valueIdx.has(i));

const dryRun = flag("--dry-run");
const store = dryRun ? "memory" : storeArg === "file" || storeArg === "supabase" ? storeArg : undefined;
const today = todayInDallas();

/**
 * Weekly national discovery (Sundays, or --discover): Claude searches the web for newly announced
 * selective-access and bucket-list events and nominates official pages. Found pages are kept for
 * 90 days in src/data/discovered-sources.json and read like any other source.
 */
async function discoveredSources(notes: { source: string; note: string }[]): Promise<Source[]> {
  const fileStore = new DiscoveredSourceStore();
  let entries = fileStore.load();
  const wanted = flag("--discover") || (weekdaySun0(today) === 0 && !ids.length && !group);
  if (wanted && process.env.ANTHROPIC_API_KEY) {
    try {
      const tracked = [...SOURCES.filter((s) => s.is_national).map((s) => s.url), ...entries.map((e) => e.source.url)];
      const found = await createNationalDiscovery()({ today, tracked });
      entries = mergeDiscovered(entries, found, today);
      notes.push({ source: "national-discovery", note: `found ${found.length} new page(s): ${found.map((s) => s.url).join(", ") || "none"}` });
      if (!dryRun) fileStore.save(entries);
    } catch (err) {
      notes.push({ source: "national-discovery", note: `failed: ${(err as Error).message}` });
    }
  } else if (wanted) {
    notes.push({ source: "national-discovery", note: "skipped (ANTHROPIC_API_KEY not set)" });
  }
  return entries.map((e) => e.source);
}

async function main() {
  const discoveryNotes: { source: string; note: string }[] = [];
  let sources = [...SOURCES, ...(await discoveredSources(discoveryNotes))];
  if (group) sources = sources.filter((s) => s.group === group);
  if (ids.length) sources = sources.filter((s) => ids.includes(s.id));
  if (sources.length === 0) {
    console.error("No sources match. Known ids:", SOURCES.map((s) => s.id).join(", "));
    process.exit(1);
  }
  const summary = await runPipeline(
    productionOptions({ sources, dryRun, store, force: flag("--force"), notes: discoveryNotes, log: (m) => console.error(m) }),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.sources_attempted > 0 && summary.sources_ok === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
