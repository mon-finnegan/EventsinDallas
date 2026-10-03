import { normalizeDateTime } from "./datetime";
import { cityFromAddress } from "./ical";
import type { StructuredInput } from "./classify";

// schema.org Event extraction from <script type="application/ld+json"> blocks. Many venue,
// ticketing and church sites (Eventbrite, Squarespace, Wix, Yoast/WordPress) publish these.

const EVENT_TYPES = /(^|:)(Event|Festival|ChildrensEvent|TheaterEvent|MusicEvent|SportsEvent|SocialEvent|EducationEvent|ExhibitionEvent|ScreeningEvent|DanceEvent|ComedyEvent|FoodEvent|LiteraryEvent|VisualArtsEvent)$/;

type Json = Record<string, unknown>;

export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // Malformed block on the source site; skip it.
    }
  }
  return out;
}

function* walk(node: unknown): Generator<Json> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
  } else if (node && typeof node === "object") {
    const obj = node as Json;
    yield obj;
    if (obj["@graph"]) yield* walk(obj["@graph"]);
    // ItemList of events
    if (obj.itemListElement) yield* walk(obj.itemListElement);
    if (obj.item) yield* walk(obj.item);
  }
}

function isEvent(obj: Json): boolean {
  const t = obj["@type"];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === "string" && EVENT_TYPES.test(x));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function location(obj: Json): Pick<StructuredInput, "venue" | "address" | "city" | "state"> {
  const loc = (Array.isArray(obj.location) ? obj.location[0] : obj.location) as Json | string | undefined;
  if (!loc) return { venue: null, address: null, city: null, state: null };
  if (typeof loc === "string") return { venue: loc, address: null, city: cityFromAddress(loc), state: null };
  if (loc["@type"] === "VirtualLocation") return { venue: "Online", address: null, city: null, state: null };
  const addr = loc.address as Json | string | undefined;
  if (typeof addr === "string") return { venue: str(loc.name), address: addr, city: cityFromAddress(addr), state: null };
  const street = str(addr?.streetAddress);
  const city = str(addr?.addressLocality);
  const state = str(addr?.addressRegion);
  const zip = str(addr?.postalCode);
  const full = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { venue: str(loc.name), address: full || null, city, state };
}

function cost(obj: Json): string | null {
  const offers = (Array.isArray(obj.offers) ? obj.offers : obj.offers ? [obj.offers] : []) as Json[];
  if (offers.length === 0) return obj.isAccessibleForFree === true ? "Free" : null;
  const prices = offers
    .map((o) => (o.price ?? o.lowPrice) as unknown)
    .map((p) => (typeof p === "number" ? p : typeof p === "string" ? Number(p.replace(/[^0-9.]/g, "")) : NaN))
    .filter((n) => Number.isFinite(n));
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === 0) return "Free";
  return min === max ? `$${min}` : `$${min}–$${max}`;
}

export function parseJsonLdEvents(html: string, opts: { today: string; pageUrl: string }): StructuredInput[] {
  const out: StructuredInput[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    for (const obj of walk(block)) {
      if (!isEvent(obj)) continue;
      const name = str(obj.name);
      const startRaw = str(obj.startDate);
      if (!name || !startRaw) continue;
      const start = normalizeDateTime(startRaw);
      if (!start) continue;
      const endRaw = str(obj.endDate);
      const end = endRaw ? normalizeDateTime(endRaw) : null;
      const multiDay = end && end.date !== start.date;
      if ((end?.date ?? start.date) < opts.today) continue;

      const status = str(obj.eventStatus) ?? "";
      out.push({
        title: decodeEntities(name),
        description: str(obj.description) ? decodeEntities(str(obj.description)!) : null,
        event_date: start.date,
        end_date: multiDay ? end!.date : null,
        start_time: start.time,
        end_time: multiDay ? null : (end?.time ?? null),
        ...location(obj),
        cost: cost(obj),
        url: str(obj.url) ?? opts.pageUrl,
        cancelled: /Cancelled/i.test(status),
      });
    }
  }
  return out;
}
