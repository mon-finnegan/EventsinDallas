// Entry for the standalone single-page build (npm run build:static). Renders the same
// CalendarApp with the bundled, verified seed data; "today" is computed in the browser.
import { createRoot } from "react-dom/client";
import { CalendarApp } from "@/components/CalendarApp";
import { allBundledEvents } from "@/data/collected";
import { todayInDallas } from "@/lib/dates";
import { validateForPublish } from "@/lib/validation";

const events = allBundledEvents().flatMap((e) => {
  const res = validateForPublish(e);
  return res.ok ? [res.event] : [];
});

createRoot(document.getElementById("root")!).render(<CalendarApp events={events} today={todayInDallas()} />);
