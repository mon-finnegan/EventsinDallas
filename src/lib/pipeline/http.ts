// Polite, resilient HTTP for the feeders.
//  - retries with exponential backoff + jitter on network errors, 408, 425, 429 and 5xx
//  - honors Retry-After
//  - per-request timeout and a response-size cap
//  - conditional GET (ETag / Last-Modified) so unchanged pages cost nothing
//  - robots.txt respected per host (cached)
//  - minimum spacing between requests to the same host

export const USER_AGENT = "DallasFamilyCalendarBot/1.0 (+family event curation; daily)";

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  maxBytes?: number;
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  /** Authorization header value for authenticated APIs (e.g. "Bearer …"). */
  authorization?: string;
  /** Skip the robots.txt check (only for endpoints like robots.txt itself). */
  ignoreRobots?: boolean;
}

export type FetchResult =
  | {
      status: "ok";
      url: string;
      body: string;
      contentType: string;
      etag: string | null;
      lastModified: string | null;
    }
  | { status: "not_modified"; url: string }
  | { status: "blocked_by_robots"; url: string };

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const HOST_SPACING_MS = 1_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HttpClient {
  get(url: string, opts?: FetchOptions): Promise<FetchResult>;
}

export function createHttpClient(deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): HttpClient {
  const doFetch = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;
  const lastHit = new Map<string, number>();
  const robotsCache = new Map<string, Promise<string[]>>();

  async function space(host: string) {
    const prev = lastHit.get(host) ?? 0;
    const delta = Date.now() - prev;
    if (delta < HOST_SPACING_MS) await wait(HOST_SPACING_MS - delta);
    lastHit.set(host, Date.now());
  }

  async function disallowed(url: URL): Promise<boolean> {
    let rules = robotsCache.get(url.host);
    if (!rules) {
      rules = (async () => {
        try {
          const res = await raw(`${url.protocol}//${url.host}/robots.txt`, { retries: 1, timeoutMs: 8_000, ignoreRobots: true });
          return res.status === "ok" ? parseRobots(res.body) : [];
        } catch {
          return []; // Unreachable robots.txt → no restrictions known.
        }
      })();
      robotsCache.set(url.host, rules);
    }
    return isDisallowed(await rules, url.pathname + url.search);
  }

  async function raw(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const { timeoutMs = 20_000, retries = 3, maxBytes = 5_000_000 } = opts;
    const parsed = new URL(url);
    if (!opts.ignoreRobots && (await disallowed(parsed))) return { status: "blocked_by_robots", url };

    let attempt = 0;
    for (;;) {
      await space(parsed.host);
      try {
        const headers: Record<string, string> = {
          "user-agent": USER_AGENT,
          accept: opts.accept ?? "text/html,application/xhtml+xml,application/json,text/calendar;q=0.9,*/*;q=0.8",
        };
        if (opts.authorization) headers.authorization = opts.authorization;
        if (opts.etag) headers["if-none-match"] = opts.etag;
        if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;

        const res = await doFetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 304) return { status: "not_modified", url };
        if (!res.ok) {
          const retryable = RETRYABLE_STATUS.has(res.status);
          const err = new HttpError(`HTTP ${res.status} fetching ${redactUrl(url)}`, res.status, retryable);
          if (!retryable || attempt >= retries) throw err;
          await wait(retryDelay(attempt, res.headers.get("retry-after")));
          attempt++;
          continue;
        }
        const declared = Number(res.headers.get("content-length") ?? 0);
        if (declared > maxBytes) throw new HttpError(`Response too large (${declared} bytes) from ${url}`, res.status, false);
        const body = await res.text();
        if (body.length > maxBytes) throw new HttpError(`Response too large from ${url}`, res.status, false);
        return {
          status: "ok",
          url: res.url || url,
          body,
          contentType: res.headers.get("content-type") ?? "",
          etag: res.headers.get("etag"),
          lastModified: res.headers.get("last-modified"),
        };
      } catch (err) {
        if (err instanceof HttpError && !err.retryable) throw err;
        if (attempt >= retries) {
          throw err instanceof HttpError ? err : new HttpError(`${(err as Error).message ?? err} fetching ${redactUrl(url)}`, null, true);
        }
        await wait(retryDelay(attempt, null));
        attempt++;
      }
    }
  }

  return { get: raw };
}

export function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 60_000);
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), 60_000);
  }
  const base = 1_000 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

/** Disallow rules that apply to us (User-agent: * or our bot name). */
export function parseRobots(txt: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  let sawRuleInGroup = false;
  for (const line of txt.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, "").trim();
    if (!clean) continue;
    const idx = clean.indexOf(":");
    if (idx < 0) continue;
    const key = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (sawRuleInGroup) {
        applies = false;
        sawRuleInGroup = false;
      }
      const ua = value.toLowerCase();
      if (ua === "*" || "dallasfamilycalendarbot".startsWith(ua)) applies = true;
    } else {
      sawRuleInGroup = true;
      if (applies && key === "disallow" && value) disallow.push(value);
    }
  }
  return disallow;
}

export function isDisallowed(rules: string[], path: string): boolean {
  const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return rules.some((rule) => {
    if (!rule.includes("*") && !rule.endsWith("$")) return path.startsWith(rule);
    const anchored = rule.endsWith("$");
    const body = anchored ? rule.slice(0, -1) : rule;
    return new RegExp("^" + body.split("*").map(escape).join(".*") + (anchored ? "$" : "")).test(path);
  });
}

/** Run tasks with a global concurrency limit. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Strip credentials from URLs before they reach logs or the committed run summary. */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:access_token|token|key|api_key|client_secret)=)[^&#]*/gi, "$1REDACTED");
}
