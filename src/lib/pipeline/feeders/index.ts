import { createHash } from "node:crypto";
import { enforceEvidence, type ExtractedEvent, type Extractor } from "../extract";
import { htmlToText } from "../fetch";
import type { HttpClient } from "../http";
import type { FeederKind, Source } from "../sources";
import { classifyStructured, type StructuredInput } from "./classify";
import { parseICal } from "./ical";
import { eventLikePosts, fetchInstagramPosts, postText, type InstagramCredentials } from "./instagram";
import { eventLikeRedditPosts, fetchRedditPosts, redditFetcher, redditPostText } from "./reddit";
import { parseJsonLdEvents } from "./jsonld";
import { parseTribePage, tribeEndpoint, type TribePage } from "./tribe";

// Feeder dispatch. Preference order for every source, cheapest and most trustworthy first:
//   1. WordPress Events Calendar REST API   (structured, exact dates)
//   2. iCal feed (linked .ics / Squarespace ?format=ical / configured feed_url)
//   3. schema.org JSON-LD Event markup on the page
//   4. Claude extraction of the page text + discovered event detail pages (evidence-checked)

export type Provenance = "structured" | "ai";

export interface FeedCandidate {
  event: ExtractedEvent;
  cancelled: boolean;
  provenance: Provenance;
  pageUrl: string;
}

export interface FeedResult {
  candidates: FeedCandidate[];
  feedersUsed: FeederKind[];
  pagesFetched: number;
  unchanged: boolean;
  /** AI extraction was needed but no extractor was configured; the page must be re-read later. */
  skippedAi: boolean;
  contentHash: string | null;
  etag: string | null;
  lastModified: string | null;
  droppedFields: { title: string; fields: string[] }[];
  notes: string[];
}

export interface FeederContext {
  http: HttpClient;
  extract: Extractor | null;
  today: string;
  /** Instagram Graph API credentials; Instagram feeders are skipped without them. */
  instagram?: InstagramCredentials | null;
  /** Returns a Reddit OAuth bearer token; Reddit feeders are skipped without it. */
  redditToken?: (() => Promise<string>) | null;
  /** Previously stored conditional-GET validators and content hash for the source page. */
  prior?: { etag: string | null; lastModified: string | null; contentHash: string | null; fresh: boolean };
}

const CHUNK_CHARS = 40_000;
const MAX_CHUNKS = 4;
const DEFAULT_DETAIL_PAGES = 6;

export const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export async function runFeeder(source: Source, ctx: FeederContext): Promise<FeedResult> {
  const result: FeedResult = {
    candidates: [],
    feedersUsed: [],
    pagesFetched: 0,
    unchanged: false,
    skippedAi: false,
    contentHash: null,
    etag: null,
    lastModified: null,
    droppedFields: [],
    notes: [],
  };
  const feeder = source.feeder ?? "auto";
  const addStructured = (items: StructuredInput[], kind: FeederKind, pageUrl: string) => {
    for (const item of items) {
      const { cancelled, ...event } = classifyStructured(withDefaultCity(item, source), source);
      result.candidates.push({ event, cancelled, provenance: "structured", pageUrl });
    }
    if (items.length && !result.feedersUsed.includes(kind)) result.feedersUsed.push(kind);
  };

  if (feeder === "instagram") {
    if (!ctx.instagram || !source.instagram_username) {
      result.notes.push("instagram not configured (IG_USER_ID / IG_ACCESS_TOKEN)");
      return result;
    }
    if (!ctx.extract) {
      result.notes.push("needs AI extraction (ANTHROPIC_API_KEY not set)");
      result.skippedAi = true;
      return result;
    }
    const posts = await fetchInstagramPosts(ctx.http, ctx.instagram, source.instagram_username);
    result.pagesFetched++;
    const fresh = eventLikePosts(posts, ctx.today);
    const hash = sha1(fresh.map((p) => p.permalink).join("|"));
    result.contentHash = hash;
    if (ctx.prior?.fresh && ctx.prior.contentHash === hash) {
      result.unchanged = true;
      return result;
    }
    for (const post of fresh) await extractWithAi(source, postText(post), post.permalink, ctx, result, false);
    if (result.feedersUsed.includes("html_ai")) result.feedersUsed = ["instagram"];
    return result;
  }

  if (feeder === "reddit") {
    if (!ctx.redditToken || !source.subreddit) {
      result.notes.push("reddit not configured (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET)");
      return result;
    }
    if (!ctx.extract) {
      result.notes.push("needs AI extraction (ANTHROPIC_API_KEY not set)");
      result.skippedAi = true;
      return result;
    }
    const posts = await fetchRedditPosts(redditFetcher(ctx.http, await ctx.redditToken()), source.subreddit);
    result.pagesFetched++;
    const fresh = eventLikeRedditPosts(posts);
    const hash = sha1(fresh.map((p) => p.permalink).join("|"));
    result.contentHash = hash;
    if (ctx.prior?.fresh && ctx.prior.contentHash === hash) {
      result.unchanged = true;
      return result;
    }
    for (const post of fresh) await extractWithAi(source, redditPostText(post), post.permalink, ctx, result, false);
    if (result.feedersUsed.includes("html_ai")) result.feedersUsed = ["reddit"];
    return result;
  }

  // Explicit structured feeds need no page fetch.
  if (feeder === "ical") {
    const res = await ctx.http.get(source.feed_url ?? source.url, { accept: "text/calendar,*/*;q=0.5" });
    result.pagesFetched++;
    if (res.status === "ok") addStructured(parseICal(res.body, { today: ctx.today }), "ical", source.url);
    else result.notes.push(`ical feed ${res.status}`);
    return result;
  }
  if (feeder === "tribe") {
    await collectTribe(new URL(source.feed_url ?? source.url).origin, source, ctx, result, addStructured);
    return result;
  }

  // Everything else starts from the source page.
  const page = await ctx.http.get(source.url, {
    etag: ctx.prior?.fresh ? ctx.prior.etag : null,
    lastModified: ctx.prior?.fresh ? ctx.prior.lastModified : null,
  });
  result.pagesFetched++;
  if (page.status === "not_modified") {
    result.unchanged = true;
    return result;
  }
  if (page.status === "blocked_by_robots") {
    result.notes.push("blocked by robots.txt");
    return result;
  }
  result.etag = page.etag;
  result.lastModified = page.lastModified;
  const html = page.body;
  const text = htmlToText(html);
  result.contentHash = sha1(text);

  if (feeder === "auto") {
    if (/tribe-events|wp-json\/tribe|tribe_events/i.test(html)) {
      await collectTribe(new URL(page.url).origin, source, ctx, result, addStructured);
    }
  }
  if (feeder === "auto" && result.candidates.length === 0) {
    const icsUrl = findICalUrl(html, page.url);
    if (icsUrl) {
      try {
        const ics = await ctx.http.get(icsUrl, { accept: "text/calendar,*/*;q=0.5" });
        result.pagesFetched++;
        if (ics.status === "ok" && /BEGIN:VCALENDAR/.test(ics.body)) {
          addStructured(parseICal(ics.body, { today: ctx.today }), "ical", source.url);
        }
      } catch (err) {
        result.notes.push(`ical discovery failed: ${(err as Error).message}`);
      }
    }
  }
  if (feeder === "auto" || feeder === "jsonld") {
    addStructured(parseJsonLdEvents(html, { today: ctx.today, pageUrl: page.url }), "jsonld", page.url);
  }

  const wantAi = feeder === "html_ai" || (feeder === "auto" && result.candidates.length === 0);
  if (!wantAi) return result;

  // Unchanged page since the last successful run → nothing new to extract.
  if (ctx.prior?.fresh && ctx.prior.contentHash === result.contentHash) {
    result.unchanged = true;
    return result;
  }
  if (!ctx.extract) {
    result.notes.push("needs AI extraction (ANTHROPIC_API_KEY not set)");
    result.skippedAi = true;
    return result;
  }

  await extractWithAi(source, text, page.url, ctx, result);

  // Follow event detail pages from listing pages.
  const maxDetail = source.max_detail_pages ?? DEFAULT_DETAIL_PAGES;
  for (const link of discoverEventLinks(html, page.url).slice(0, maxDetail)) {
    try {
      const detail = await ctx.http.get(link);
      result.pagesFetched++;
      if (detail.status !== "ok") continue;
      const structured = parseJsonLdEvents(detail.body, { today: ctx.today, pageUrl: detail.url });
      if (structured.length) addStructured(structured, "jsonld", detail.url);
      else await extractWithAi(source, htmlToText(detail.body), detail.url, ctx, result);
    } catch (err) {
      result.notes.push(`detail page failed (${link}): ${(err as Error).message}`);
    }
  }
  return result;
}

async function collectTribe(
  origin: string,
  source: Source,
  ctx: FeederContext,
  result: FeedResult,
  add: (items: StructuredInput[], kind: FeederKind, pageUrl: string) => void,
) {
  let next: string | undefined = tribeEndpoint(origin, ctx.today);
  for (let pageNo = 0; next && pageNo < 5; pageNo++) {
    try {
      const res = await ctx.http.get(next, { accept: "application/json" });
      result.pagesFetched++;
      if (res.status !== "ok") break;
      const json = JSON.parse(res.body) as TribePage;
      add(parseTribePage(json), "tribe", source.url);
      next = json.next_rest_url;
    } catch (err) {
      result.notes.push(`tribe api: ${(err as Error).message}`);
      break;
    }
  }
}

async function extractWithAi(
  source: Source,
  text: string,
  pageUrl: string,
  ctx: FeederContext,
  result: FeedResult,
  // Most social posts aren't events, so an empty result there isn't worth a note.
  noteEmpty = true,
) {
  for (const chunk of chunkText(text, CHUNK_CHARS).slice(0, MAX_CHUNKS)) {
    const extracted = await ctx.extract!({ source, text: chunk, today: ctx.today });
    if (noteEmpty && extracted.length === 0) result.notes.push(`AI found no events in ${chunk.length} chars of ${pageUrl}`);
    for (const raw of extracted) {
      const { event, dropped } = enforceEvidence(raw, chunk);
      if (dropped.length) result.droppedFields.push({ title: raw.title, fields: dropped });
      result.candidates.push({ event, cancelled: false, provenance: "ai", pageUrl });
    }
  }
  if (!result.feedersUsed.includes("html_ai")) result.feedersUsed.push("html_ai");
}

function withDefaultCity(item: StructuredInput, source: Source): StructuredInput {
  return item.city || !source.default_city ? item : { ...item, city: source.default_city };
}

export function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split("\n")) {
    if (current.length + para.length + 1 > size && current) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + para.slice(0, size);
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Find an iCal feed advertised by the page. */
export function findICalUrl(html: string, pageUrl: string): string | null {
  const alt = html.match(/<link[^>]+type=["']text\/calendar["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1];
  const anchor = html.match(/href=["']((?:webcal:\/\/|https?:\/\/|\/)[^"']+?\.ics(?:\?[^"']*)?)["']/i)?.[1];
  const candidate = alt ?? anchor;
  if (candidate) return new URL(candidate.replace(/^webcal:/i, "https:"), pageUrl).toString();
  if (/static1\.squarespace\.com|Squarespace/i.test(html)) {
    const u = new URL(pageUrl);
    u.searchParams.set("format", "ical");
    return u.toString();
  }
  return null;
}

const EVENTISH = /\/(events?|calendar|festival|fest|christmas|holiday|halloween|pumpkin|santa|easter|tickets?|programs?)(\/|-|$)/i;
const SKIP = /\/(tag|category|categories|page|feed|author|wp-json|month|list|day|week|photo|map)\/|\.(pdf|jpe?g|png|gif|svg|ics|zip)$|[?&](ical|format|outlook-ical|tribe-bar|eventDisplay)=|#/i;

/** Same-site links that look like individual event pages. */
export function discoverEventLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const seen = new Set<string>([base.toString()]);
  const out: string[] = [];
  const re = /<a\b[^>]*href=["']([^"'#][^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let url: URL;
    try {
      url = new URL(m[1], base);
    } catch {
      continue;
    }
    if (url.host !== base.host || !/^https?:$/.test(url.protocol)) continue;
    const href = url.toString();
    if (seen.has(href) || SKIP.test(href) || !EVENTISH.test(url.pathname)) continue;
    // Listing pages themselves (".../events/") are less useful than detail pages.
    if (url.pathname.replace(/\/+$/, "") === base.pathname.replace(/\/+$/, "")) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}
