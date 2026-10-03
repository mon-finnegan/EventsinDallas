// Run the daily pipeline outside Vercel (GitHub Actions, local):  npm run refresh
// Requires ANTHROPIC_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClaudeExtractor } from "../src/lib/pipeline/extract";
import { runPipeline } from "../src/lib/pipeline/run";
import { SOURCES } from "../src/lib/pipeline/sources";
import { getRepository } from "../src/lib/repository";

const only = process.argv.slice(2);
const sources = only.length ? SOURCES.filter((s) => only.includes(s.id)) : SOURCES;

runPipeline({ sources, extract: createClaudeExtractor(), repo: getRepository({ write: true }) })
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.sources_ok === 0 && sources.length > 0) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
