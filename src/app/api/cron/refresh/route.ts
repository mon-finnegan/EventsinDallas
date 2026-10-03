import { runPipeline } from "@/lib/pipeline/run";
import { productionOptions } from "@/lib/pipeline/setup";

// Daily discovery + verification run (spec §27). Scheduled by vercel.json; Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET`.
export const maxDuration = 800;

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
