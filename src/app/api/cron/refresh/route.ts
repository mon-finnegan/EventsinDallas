import { runPipeline } from "@/lib/pipeline/run";
import { productionOptions } from "@/lib/pipeline/setup";

// Daily discovery + verification run (spec §27). Scheduled by vercel.json; Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET`. 300s is the Vercel Hobby limit; the full ~100-source
// crawl can take longer, so the GitHub Actions workflow (45-minute budget) is the primary runner
// and this route finishes whatever fits.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  const summary = await runPipeline(productionOptions());
  return Response.json(summary);
}
