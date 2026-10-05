import type { HttpClient } from "../http";

// Reddit feeder via Reddit's official OAuth API (application-only "client_credentials" grant).
// Reads recent posts in local subreddits (r/Dallas, r/askdfw, …) that look like event
// announcements; the extractor then pulls dated events from post text, evidence-checked.
// Needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET from a registered Reddit app.

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
}

export interface RedditPost {
  title: string;
  text: string;
  permalink: string;
  createdUtc: number;
  score: number;
}

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API = "https://oauth.reddit.com";
export const EVENT_QUERY = 'event OR festival OR "this weekend" OR concert OR market OR fair OR "things to do"';

let cached: { token: string; expires: number; key: string } | null = null;

/** Exchange app credentials for a bearer token (cached for its 1-hour lifetime). */
export async function redditToken(creds: RedditCredentials, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = creds.clientId;
  if (cached && cached.key === key && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "DallasFamilyCalendarBot/1.0",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Reddit token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Reddit token missing in response");
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000, key };
  return json.access_token;
}

export function subredditSearchUrl(subreddit: string, query = EVENT_QUERY): string {
  const q = encodeURIComponent(query);
  return `${API}/r/${encodeURIComponent(subreddit)}/search?q=${q}&restrict_sr=1&sort=new&t=week&limit=50&raw_json=1`;
}

interface Listing {
  data?: { children?: { data?: { title?: string; selftext?: string; permalink?: string; created_utc?: number; score?: number; over_18?: boolean } }[] };
}

export async function fetchRedditPosts(
  fetchJson: (url: string) => Promise<string>,
  subreddit: string,
): Promise<RedditPost[]> {
  const body = await fetchJson(subredditSearchUrl(subreddit));
  const listing = JSON.parse(body) as Listing;
  return (listing.data?.children ?? [])
    .map((c) => c.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.title && d.permalink && !d.over_18))
    .map((d) => ({
      title: d.title!,
      text: d.selftext ?? "",
      permalink: `https://www.reddit.com${d.permalink}`,
      createdUtc: d.created_utc ?? 0,
      score: d.score ?? 0,
    }));
}

const DATE_HINT = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b(this|next) (weekend|saturday|sunday|friday)\b/i;

/** Community posts are noisy: keep ones with a concrete date and some community upvotes. */
export function eventLikeRedditPosts(posts: RedditPost[], minScore = 3): RedditPost[] {
  return posts.filter((p) => p.score >= minScore && DATE_HINT.test(`${p.title} ${p.text}`));
}

export function redditPostText(post: RedditPost): string {
  const posted = new Date(post.createdUtc * 1000).toISOString().slice(0, 10);
  return `Reddit post published ${posted}. ${post.title}\n${post.text}`.slice(0, 20_000);
}

/** Authenticated GET through the shared HTTP client (robots.txt does not apply to the API). */
export function redditFetcher(http: HttpClient, token: string) {
  return async (url: string): Promise<string> => {
    const res = await http.get(url, { accept: "application/json", ignoreRobots: true, authorization: `Bearer ${token}` });
    if (res.status !== "ok") throw new Error(`Reddit API ${res.status}`);
    return res.body;
  };
}
