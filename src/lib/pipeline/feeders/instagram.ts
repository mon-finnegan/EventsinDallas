import type { HttpClient } from "../http";

// Instagram feeder via the official Instagram Graph API "Business Discovery" endpoint, which lets
// an Instagram Business/Creator account read public posts of other Business/Creator accounts.
// Scraping instagram.com directly is against Instagram's terms and blocked for bots, so this is
// the supported route. Needs IG_USER_ID (your business account id) and IG_ACCESS_TOKEN.

export interface InstagramCredentials {
  userId: string;
  accessToken: string;
}

export interface InstagramPost {
  caption: string;
  permalink: string;
  timestamp: string;
}

const GRAPH = "https://graph.facebook.com/v21.0";

export function businessDiscoveryUrl(creds: InstagramCredentials, username: string, limit = 25): string {
  const fields = `business_discovery.username(${username}){media.limit(${limit}){caption,permalink,timestamp}}`;
  return `${GRAPH}/${encodeURIComponent(creds.userId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(creds.accessToken)}`;
}

interface DiscoveryResponse {
  business_discovery?: { media?: { data?: { caption?: string; permalink?: string; timestamp?: string }[] } };
  error?: { message?: string };
}

export async function fetchInstagramPosts(
  http: HttpClient,
  creds: InstagramCredentials,
  username: string,
): Promise<InstagramPost[]> {
  const res = await http.get(businessDiscoveryUrl(creds, username), { accept: "application/json", ignoreRobots: true });
  if (res.status !== "ok") return [];
  const json = JSON.parse(res.body) as DiscoveryResponse;
  if (json.error) throw new Error(`Instagram API: ${json.error.message ?? "error"}`);
  return (json.business_discovery?.media?.data ?? [])
    .filter((p): p is InstagramPost => Boolean(p.caption && p.permalink && p.timestamp))
    .map((p) => ({ caption: p.caption, permalink: p.permalink, timestamp: p.timestamp }));
}

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/i;

/** Only recent posts that state a concrete date are worth an extraction call. */
export function eventLikePosts(posts: InstagramPost[], today: string, maxAgeDays = 45): InstagramPost[] {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);
  return posts.filter((p) => new Date(p.timestamp) >= cutoff && MONTHS.test(p.caption));
}

/** Caption text handed to the extractor; the posting date anchors years like "Oct 24". */
export function postText(post: InstagramPost): string {
  return `Instagram post published ${post.timestamp.slice(0, 10)}.\n${post.caption}`;
}
