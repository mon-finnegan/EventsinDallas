import type { CalendarEvent } from "../types";

// Venue reputation enrichment via Google Places API (New) Text Search. Optional: runs only
// when GOOGLE_PLACES_API_KEY is set. Review counts come from the lookup itself, never estimated,
// and they feed the (internal) relevance score so well-loved venues rank higher.

export interface VenueReview {
  rating: number;
  review_count: number;
  source: string;
  url: string | null;
}

export type ReviewLookup = (venue: string, city: string | null) => Promise<VenueReview | null>;

export function venueKey(venue: string, city: string | null): string {
  return `${venue.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(city ?? "").toLowerCase()}`;
}

export function createGooglePlacesLookup(apiKey: string, fetchImpl: typeof fetch = fetch): ReviewLookup {
  return async (venue, city) => {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: `${venue}, ${city ?? "Dallas"}, TX`, maxResultCount: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Places lookup HTTP ${res.status}`);
    const json = (await res.json()) as {
      places?: { displayName?: { text?: string }; rating?: number; userRatingCount?: number; googleMapsUri?: string }[];
    };
    const place = json.places?.[0];
    if (!place || typeof place.rating !== "number" || typeof place.userRatingCount !== "number") return null;
    // Guard against a lookup that matched some other business.
    if (!namesMatch(venue, place.displayName?.text ?? "")) return null;
    return { rating: place.rating, review_count: place.userRatingCount, source: "Google", url: place.googleMapsUri ?? null };
  };
}

export function namesMatch(a: string, b: string): boolean {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(" ")
        .filter((w) => w.length > 2 && !["the", "and", "dallas", "texas", "church", "park", "center"].includes(w)),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.5;
}

/** Attach reviews to events with a venue; one lookup per venue per run. */
export async function enrichWithReviews(
  events: CalendarEvent[],
  lookup: ReviewLookup,
  cache = new Map<string, VenueReview | null>(),
): Promise<{ events: CalendarEvent[]; lookups: number; errors: string[] }> {
  const errors: string[] = [];
  let lookups = 0;
  const out: CalendarEvent[] = [];
  for (const e of events) {
    if (!e.venue || e.scope === "NATIONAL" || e.review_count !== null) {
      out.push(e);
      continue;
    }
    const key = venueKey(e.venue, e.city);
    if (!cache.has(key)) {
      try {
        lookups++;
        cache.set(key, await lookup(e.venue, e.city));
      } catch (err) {
        errors.push(`${e.venue}: ${(err as Error).message}`);
        cache.set(key, null);
      }
    }
    const r = cache.get(key);
    out.push(
      r ? { ...e, review_rating: r.rating, review_count: r.review_count, review_source: r.source, review_url: r.url } : e,
    );
  }
  return { events: out, lookups, errors };
}
