// Run the daily pipeline outside Vercel (GitHub Actions, local).
//
//   npm run refresh                         all due sources
//   npm run refresh -- klyde-warren perot   only these source ids
//   npm run refresh -- --group church       one group (church, venue, civic, …)
//   npm run refresh -- --dry-run            fetch + extract, write nothing
//   npm run refresh -- --force              ignore backoff and cached validators
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist; ANTHROPIC_API_KEY enables AI
// extraction for sources without structured feeds; GOOGLE_PLACES_API_KEY enables review counts.
import { runPipeline } from "../src/lib/pipeline/run";
import { productionOptions } from "../src/lib/pipeline/setup";
import { SOURCES } from "../src/lib/pipeline/sources";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const groupIdx = args.indexOf("--group");
const group = groupIdx >= 0 ? args[groupIdx + 1] : null;
const ids = args.filter((a, i) => !a.startsWith("--") && i !== groupIdx + 1);

let sources = SOURCES;
if (group) sources = sources.filter((s) => s.group === group);
if (ids.length) sources = sources.filter((s) => ids.includes(s.id));
if (sources.length === 0) {
  console.error("No sources match. Known ids:", SOURCES.map((s) => s.id).join(", "));
  process.exit(1);
}

const dryRun = flag("--dry-run");
if (!dryRun && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --dry-run.");
  process.exit(1);
}

runPipeline(productionOptions({ sources, dryRun, force: flag("--force"), log: (m) => console.error(m) }))
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.sources_attempted > 0 && summary.sources_ok === 0) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
