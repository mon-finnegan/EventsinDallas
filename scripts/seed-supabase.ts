// Load the verified seed dataset into Supabase:  npm run seed
import { SEED_EVENTS } from "../src/data/seed";
import { getRepository } from "../src/lib/repository";
import { validateForPublish } from "../src/lib/validation";

const invalid = SEED_EVENTS.map((e) => ({ id: e.id, res: validateForPublish(e) })).filter((r) => !r.res.ok);
if (invalid.length) {
  console.error("Seed data failed validation:", JSON.stringify(invalid, null, 2));
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
getRepository({ write: true })
  .upsert(SEED_EVENTS)
  .then(() => console.log(`Upserted ${SEED_EVENTS.length} events.`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
