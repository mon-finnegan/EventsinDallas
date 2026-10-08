import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { SourceType } from "../types";
import type { Source } from "./sources";

// National discovery: once a week Claude searches the web for newly announced bucket-list and
// selective-access events (White House tours, landmark lotteries, championship ticket windows).
// It only nominates *pages*. Each page then goes through the normal feeder chain, so every date
// that reaches the calendar is still quoted from the page itself — nothing comes from search
// snippets or the model's memory.

export const DISCOVERY_SYSTEM = `You find official web pages that announce nationally notable,
hard-to-get experiences in the United States for the next six months: places and moments opened to the
public only selectively, and bucket-list events with ticket lotteries, ballots, applications or
release dates.

What qualifies:
- Selective public access: White House garden tours, holiday tours and open houses, the National
  Christmas Tree lighting lottery, the White House Easter Egg Roll lottery, U.S. Capitol and landmark
  tree lightings, request-only tours (Congress, state capitols, governors' mansions), candlelight tours
  of historic estates, public rocket-launch viewing.
- Bucket-list events: golf majors, Olympics, Super Bowl, College Football Playoff games, the
  Kentucky Derby, the Masters, Wimbledon, the Rose Parade, the NFL Draft, and similar once-a-year
  spectacles with limited tickets or lottery windows.

Rules:
- Prefer the official page (the organizer, .gov, the venue). Use news coverage only when it states a
  date the official page has not posted yet.
- Only include pages that state a specific date or open/close window that falls between today and six
  months from now.
- Skip anything already covered by the pages listed under "Already tracked".
- Finish with the final list: one URL per line, each line starting with "URL: ", at most 12 lines.`;

export interface DiscoveryOptions {
  /** Search calls Claude may make in one discovery run. */
  maxSearches?: number;
  /** Maximum pages returned. */
  maxPages?: number;
}

/**
 * URLs Claude listed in its final answer that also appeared in its search results. Requiring the
 * search result keeps an invented or misremembered URL from ever becoming a source.
 */
export function pickDiscoveredUrls(content: Anthropic.Beta.BetaContentBlock[], maxPages = 12): string[] {
  const seen = new Set<string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const r of block.content) if (r.type === "web_search_result") seen.add(normalizeUrl(r.url));
  }
  const text = content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*URL:\s*(https?:\/\/\S+)/gim)) {
    const url = m[1].replace(/[)\].,;]+$/, "");
    if (seen.has(normalizeUrl(url)) && !out.includes(url)) out.push(url);
    if (out.length >= maxPages) break;
  }
  return out;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** A discovered page becomes an ordinary national source, read with the standard feeder chain. */
export function discoveredSource(url: string): Source {
  const host = new URL(url).host.replace(/^www\./, "");
  const official: SourceType = /\.(gov|mil)$/.test(host) ? "official_municipal" : "official_organization";
  const looksLikeNews = /(news|times|post|tribune|journal|magazine|today|patch|abc|nbc|cbs|fox|cnn)\b/.test(host);
  return {
    id: `discovered-${createHash("sha1").update(url).digest("hex").slice(0, 10)}`,
    name: `Discovered: ${host}`,
    url,
    source_type: looksLikeNews ? "local_calendar" : official,
    group: "national",
    is_church: false,
    is_national: true,
    feeder: "auto",
    max_detail_pages: 0,
  };
}

export type NationalDiscovery = (args: { today: string; tracked: string[] }) => Promise<Source[]>;

export function createNationalDiscovery(client = new Anthropic(), opts: DiscoveryOptions = {}): NationalDiscovery {
  const maxSearches = opts.maxSearches ?? 10;
  return async ({ today, tracked }) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: "user",
        content: `Today is ${today}. Find official pages for qualifying experiences between ${today} and six months out.

Already tracked:
${tracked.map((u) => `- ${u}`).join("\n")}`,
      },
    ];
    let response: Anthropic.Beta.BetaMessage | null = null;
    const content: Anthropic.Beta.BetaContentBlock[] = [];
    // Server-side search runs its own loop; a long one pauses and is resumed by resending the turn.
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: DISCOVERY_SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches, user_location: { type: "approximate", country: "US" } }],
        messages,
      });
      content.push(...response.content);
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }
    if (response?.stop_reason === "refusal") throw new Error("National discovery was declined");
    const known = new Set(tracked.map(normalizeUrl));
    return pickDiscoveredUrls(content, opts.maxPages ?? 12)
      .filter((u) => !known.has(normalizeUrl(u)))
      .map(discoveredSource);
  };
}
