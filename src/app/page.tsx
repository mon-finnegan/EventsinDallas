import { connection } from "next/server";
import { CalendarApp } from "@/components/CalendarApp";
import { todayInDallas } from "@/lib/dates";
import { getPublishedEvents } from "@/lib/repository";

export default async function Home() {
  // Render per request so "today" and freshly verified data are always current.
  await connection();
  const events = await getPublishedEvents();
  return <CalendarApp events={events} today={todayInDallas()} />;
}
