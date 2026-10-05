// Run the daily pipeline outside Vercel (GitHub Actions, local).
//
//   npm run refresh                         all due sources
//   npm run refresh -- klyde-warren perot   only these source ids
//   npm run refresh -- --group church       one group (church, venue, civic, …)
//   npm run refresh -- --dry-run            fetch + extract, write nothing
//   npm run refresh -- --force              ignore backoff and cached validators
//   npm run refresh -- --store file         save to src/data/*.json (the GitHub Actions default)
//
// Storage: Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise the JSON
// files in src/data (committed by the daily workflow). Optional keys: ANTHROPIC_API_KEY (AI
// extraction), REDDIT_CLIENT_ID/SECRET, IG_USER_ID/IG_ACCESS_TOKEN, GOOGLE_PLACES_API_KEY.
import { runPipeline } from "../src/lib/pipeline/run";
import { productionOptions } from "../src/lib/pipeline/setup";
import { SOURCES } from "../src/lib/pipeline/sources";

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

let sources = SOURCES;
if (group) sources = sources.filter((s) => s.group === group);
if (ids.length) sources = sources.filter((s) => ids.includes(s.id));
if (sources.length === 0) {
  console.error("No sources match. Known ids:", SOURCES.map((s) => s.id).join(", "));
  process.exit(1);
}

const dryRun = flag("--dry-run");
const store = dryRun ? "memory" : storeArg === "file" || storeArg === "supabase" ? storeArg : undefined;

runPipeline(productionOptions({ sources, dryRun, store, force: flag("--force"), log: (m) => console.error(m) }))
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.sources_attempted > 0 && summary.sources_ok === 0) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
