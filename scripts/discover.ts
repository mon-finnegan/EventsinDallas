// Inspect a candidate source before adding it:  npm run discover -- https://example.org/events
// Reports which feeder the pipeline would use and how many upcoming events it can read
// without AI. Prints a ready-to-paste SOURCES entry.
import { runFeeder } from "../src/lib/pipeline/feeders";
import { createHttpClient } from "../src/lib/pipeline/http";
import type { Source } from "../src/lib/pipeline/sources";
import { todayInDallas } from "../src/lib/dates";

const url = process.argv[2];
if (!url) {
  console.error("usage: npm run discover -- <url>");
  process.exit(1);
}
const source: Source = {
  id: new URL(url).hostname.replace(/^www\./, "").split(".")[0],
  name: new URL(url).hostname,
  url,
  source_type: "official_organization",
  group: "venue",
  is_church: false,
  is_national: false,
};

runFeeder(source, { http: createHttpClient(), extract: null, today: todayInDallas() })
  .then((r) => {
    console.log(`feeders: ${r.feedersUsed.join(", ") || "none (would need AI extraction)"}`);
    console.log(`pages fetched: ${r.pagesFetched}`);
    console.log(`structured upcoming events: ${r.candidates.length}`);
    for (const c of r.candidates.slice(0, 15)) {
      console.log(`  ${c.event.event_date} ${c.event.start_time ?? "     "}  ${c.event.title}`);
    }
    for (const n of r.notes) console.log(`note: ${n}`);
    console.log(`\nSOURCES entry:\n  def({ id: "${source.id}", name: "…", url: "${url}", source_type: "official_organization", group: "…" }),`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
