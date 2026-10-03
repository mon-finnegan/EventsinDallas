import { connection } from "next/server";
import { getPublishedEvents } from "@/lib/repository";

export async function GET() {
  await connection();
  return Response.json({ events: await getPublishedEvents() });
}
