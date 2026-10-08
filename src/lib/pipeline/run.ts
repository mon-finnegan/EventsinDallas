import { createHash } from "node:crypto";
import { isExpired } from "../calendar";
import { daysBetween, todayInDallas } from "../dates";
import { dedupe, dedupeKey, normalizeTitle, sameEvent } from "../dedupe";
import { assessRelevance, curateByWeek, MAX_EVENTS_PER_WEEK } from "../relevance";
import type { EventRepository } from "../repository";
import type { CalendarEvent, Category } from "../types";
import { validateForPublish } from "../validation";
import type { ExtractedEvent, Extractor } from "./extract";
import type { InstagramCredentials } from "./feeders/instagram";
import { runFeeder, type FeedCandidate, type FeedResult } from "./feeders";
import { createHttpClient, mapWithConcurrency, type HttpClient } from "./http";
import { enrichWithReviews, type ReviewLookup } from "./reviews";
import { expandRollingSources, type FeederKind, type Source } from "./sources";
import { buildCalendarItems, emptyDays } from "../calendar";
import { addDays } from "../dates";
import { emptyState, isDue, isFresh, MemoryStateStore, type SourceState, type SourceStateStore } from "./state";

// Daily pipeline (spec §27):
//  SOURCES ─(due? backoff)→ FEEDERS (tribe → iCal → JSON-LD → AI) → EVIDENCE CHECK
//  → VALIDATION → RELEVANCE → DEDUPE vs stored → REVIEW ENRICHMENT → WEEKLY CURATION → DATABASE
// One broken source never stops the run; its failure is recorded and it backs off.

export interface RunSummary {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  dry_run: boolean;
  sources_total: number;
  sources_attempted: number;
  sources_ok: number;
  sources_unchanged: string[];
  sources_empty: string[];
  sources_skipped_backoff: string[];
  sources_failed: { id: string; error: string; consecutive_failures: number }[];
  feeders_used: Partial<Record<FeederKind, number>>;
  pages_fetched: number;
  extracted: number;
  extracted_structured: number;
  extracted_ai: number;
  dropped_unsupported_fields: { title: string; fields: string[] }[];
  rejected_validation: { title: string; source: string; errors: string[] }[];
  rejected_relevance: { title: string; source: string; reasons: string[] }[];
  cut_for_volume: { title: string; event_date: string | null }[];
  cancelled: string[];
  published: number;
  reconfirmed: number;
  marked_completed: number;
  stale: { id: string; title: string; last_verified_at: string }[];
  review_lookups: number;
  review_errors: string[];
  notes: { source: string; note: string }[];
  /** Rolling coverage: days in the next `coverage_days` with nothing specific scheduled. */
  coverage_days: number;
  empty_days: string[];
  /** Stored events dropped because they fail the current relevance rules. */
  pruned: { title: string; reasons: string[] }[];
  /** Stored listings dropped because their source no longer lists them. */
  replaced: number;
  /** Daily/weekly programs folded into a single upcoming entry. */
  collapsed_series: { title: string; occurrences: number }[];
}

export interface PipelineOptions {
  sources: Source[];
  extract: Extractor | null;
  repo: EventRepository;
  state?: SourceStateStore;
  http?: HttpClient;
  reviews?: ReviewLookup | null;
  instagram?: InstagramCredentials | null;
  redditToken?: (() => Promise<string>) | null;
  now?: Date;
  concurrency?: number;
  dryRun?: boolean;
  /** Ignore backoff and cached validators (manual re-crawl). */
  force?: boolean;
  /** Notes from work done before the run (e.g. national discovery), carried into the summary. */
  notes?: { source: string; note: string }[];
  maxPerWeek?: number;
  /** Events not re-verified for this many days are reported as stale. */
  staleAfterDays?: number;
  /** Rolling window checked for empty days (default 30). */
  coverageDays?: number;
  log?: (msg: string) => void;
}

const KIND_TO_CATEGORY: Record<ExtractedEvent["kind"], Category> = {
  dallas_event: "DALLAS_EVENT",
  toddler_family_event: "TODDLER_EVENT",
  signup_alert: "SIGNUP_ALERT",
};

function stableId(e: CalendarEvent): string {
  return createHash("sha1").update(dedupeKey(e)).digest("hex").slice(0, 16);
}

export function toCalendarEvent(
  x: ExtractedEvent,
  source: Source,
  now: string,
  opts: { cancelled?: boolean; pageUrl?: string } = {},
): CalendarEvent {
  const { kind, evidence: _evidence, ...rest } = x;
  void _evidence;
  const event: CalendarEvent = {
    ...rest,
    id: "",
    open_daily: false,
    closed_dates: [],
    category: KIND_TO_CATEGORY[kind],
    scope: source.is_national ? "NATIONAL" : "DALLAS",
    national_interest: source.is_national ? x.national_interest : null,
    city: x.city ?? (source.is_national ? null : (source.default_city ?? null)),
    timezone: "America/Chicago",
    is_church_hosted: x.is_church_hosted || source.is_church,
    event_url: x.event_url ?? (opts.pageUrl && opts.pageUrl !== source.url ? opts.pageUrl : null),
    source_name: source.name,
    source_url: opts.pageUrl ?? source.url,
    source_type: source.source_type,
    verification_note:
      source.group === "social"
        ? "Found in a community or social post (see source link). Confirm details with the organizer before going."
        : null,
    review_rating: null,
    review_count: null,
    review_source: null,
    review_url: null,
    status: opts.cancelled ? "CANCELLED" : "UPCOMING",
    last_verified_at: now,
    created_at: now,
    updated_at: now,
  };
  event.id = stableId(event);
  return event;
}

export async function runPipeline(opts: PipelineOptions): Promise<RunSummary> {
  const t0 = Date.now();
  const nowDate = opts.now ?? new Date();
  const now = nowDate.toISOString();
  const today = todayInDallas(nowDate);
  const http = opts.http ?? createHttpClient();
  const stateStore = opts.state ?? new MemoryStateStore();
  const log = opts.log ?? (() => {});

  const summary: RunSummary = {
    started_at: now,
    finished_at: now,
    duration_ms: 0,
    dry_run: Boolean(opts.dryRun),
    sources_total: opts.sources.length,
    sources_attempted: 0,
    sources_ok: 0,
    sources_unchanged: [],
    sources_empty: [],
    sources_skipped_backoff: [],
    sources_failed: [],
    feeders_used: {},
    pages_fetched: 0,
    extracted: 0,
    extracted_structured: 0,
    extracted_ai: 0,
    dropped_unsupported_fields: [],
    rejected_validation: [],
    rejected_relevance: [],
    cut_for_volume: [],
    cancelled: [],
    published: 0,
    reconfirmed: 0,
    marked_completed: 0,
    stale: [],
    review_lookups: 0,
    review_errors: [],
    notes: [...(opts.notes ?? [])],
    coverage_days: opts.coverageDays ?? 30,
    empty_days: [],
    pruned: [],
    replaced: 0,
    collapsed_series: [],
  };

  const sources = expandRollingSources(opts.sources, today);
  summary.sources_total = sources.length;
  const states = await stateStore.getAll();
  const nextStates: SourceState[] = [];
  const due = sources.filter((s) => {
    const ok = opts.force || isDue(states.get(s.id), today);
    if (!ok) summary.sources_skipped_backoff.push(s.id);
    return ok;
  });

  // ── 1. Fetch every due source (bounded concurrency; per-host spacing lives in the client)
  const collected: { source: Source; result: FeedResult }[] = [];
  await mapWithConcurrency(due, opts.concurrency ?? 4, async (source) => {
    const prior = states.get(source.id) ?? emptyState(source.id);
    // A source that has never produced anything (e.g. it was read before AI extraction was
    // configured) gets a full re-read instead of being skipped as unchanged.
    const neverRead = Boolean(opts.extract) && prior.last_feeders.length === 0;
    const fresh = !opts.force && !neverRead && isFresh(prior, today);
    summary.sources_attempted++;
    try {
      const result = await runFeeder(source, {
        http,
        extract: opts.extract,
        instagram: opts.instagram ?? null,
        redditToken: opts.redditToken ?? null,
        today,
        prior: { etag: prior.etag, lastModified: prior.last_modified, contentHash: prior.content_hash, fresh },
      });
      summary.sources_ok++;
      summary.pages_fetched += result.pagesFetched;
      for (const f of result.feedersUsed) summary.feeders_used[f] = (summary.feeders_used[f] ?? 0) + 1;
      for (const n of result.notes) summary.notes.push({ source: source.id, note: n });
      summary.dropped_unsupported_fields.push(...result.droppedFields);
      if (result.unchanged) summary.sources_unchanged.push(source.id);
      else if (result.candidates.length === 0) summary.sources_empty.push(source.id);
      collected.push({ source, result });
      nextStates.push({
        ...prior,
        // A page that still needs AI extraction is not "seen": keep no cache keys for it.
        etag: result.skippedAi ? null : (result.etag ?? (result.unchanged ? prior.etag : null)),
        last_modified: result.skippedAi ? null : (result.lastModified ?? (result.unchanged ? prior.last_modified : null)),
        content_hash: result.skippedAi ? null : (result.contentHash ?? prior.content_hash),
        last_run_at: now,
        last_success_at: now,
        consecutive_failures: 0,
        last_error: null,
        last_feeders: result.feedersUsed.length ? result.feedersUsed : prior.last_feeders,
        last_event_count: result.unchanged ? prior.last_event_count : result.candidates.length,
      });
      log(`✓ ${source.id}: ${result.candidates.length} candidates${result.unchanged ? " (unchanged)" : ""}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A rejected API key is our configuration problem, not the source's: no backoff.
      const failures = isCredentialError(message) ? prior.consecutive_failures : prior.consecutive_failures + 1;
      summary.sources_failed.push({ id: source.id, error: message, consecutive_failures: failures });
      nextStates.push({ ...prior, last_run_at: now, consecutive_failures: failures, last_error: message });
      log(`✗ ${source.id}: ${message}`);
    }
  });

  // ── 2. Normalize → validate → relevance
  const accepted: CalendarEvent[] = [];
  const scores = new Map<string, number>();
  const unchangedSourceUrls = new Set<string>();
  for (const { source, result } of collected) {
    if (result.unchanged) unchangedSourceUrls.add(source.url);
    for (const c of result.candidates) {
      summary.extracted++;
      if (c.provenance === "ai") summary.extracted_ai++;
      else summary.extracted_structured++;
      const event = candidateToEvent(c, source, now);
      const v = validateForPublish(event);
      if (!v.ok) {
        summary.rejected_validation.push({ title: event.title, source: source.id, errors: v.errors });
        continue;
      }
      if (v.event.status === "CANCELLED") summary.cancelled.push(v.event.title);
      if (isExpired(v.event, today) && v.event.status !== "CANCELLED") continue;
      const r = assessRelevance(v.event);
      if (!r.include && v.event.status !== "CANCELLED") {
        summary.rejected_relevance.push({ title: event.title, source: source.id, reasons: r.reasons });
        continue;
      }
      scores.set(v.event.id, r.score);
      accepted.push(v.event);
    }
  }

  // ── 3. Merge with stored events; a re-sighting updates the stored row, never twins it
  // Stored events are re-checked against today's rules, so tightening a filter also cleans
  // out anything it would now reject (signup alerts and cancellations are always kept).
  const stored = await opts.repo.list();
  // A source that was fully re-read this run is the current truth for its events: drop its old
  // listings that it no longer lists (moved dates, removed events). Seed events are re-added on
  // read in file mode and are never deleted from Supabase.
  const rereadSources = new Set(
    collected.filter(({ result }) => !result.unchanged && result.feedersUsed.length > 0).map(({ source }) => source.name),
  );
  const acceptedIds = new Set(accepted.map((e) => e.id));
  const removedIds: string[] = [];
  const existing = stored.filter((e) => {
    if (rereadSources.has(e.source_name) && !acceptedIds.has(e.id) && !isExpired(e, today)) {
      summary.replaced++;
      removedIds.push(e.id);
      return false;
    }
    if (e.category === "SIGNUP_ALERT" || e.status === "CANCELLED" || e.signup_required) return true;
    const r = assessRelevance(e);
    if (!r.include) {
      summary.pruned.push({ title: e.title, reasons: r.reasons });
      removedIds.push(e.id);
    }
    return r.include;
  });
  const existingByKey = new Map(existing.map((e) => [dedupeKey(e), e]));
  const existingIds = new Set(existing.map((e) => e.id));
  let merged = collapseLongSeries(dedupe([...accepted, ...existing]), today, summary).map((e) => {
    const prior = existingByKey.get(dedupeKey(e)) ?? existing.find((x) => sameEvent(x, e));
    if (!prior) return e;
    return { ...e, id: prior.id, created_at: prior.created_at };
  });

  // Pages that did not change since the last successful read re-confirm their events.
  merged = merged.map((e) => {
    if (unchangedSourceUrls.has(e.source_url) && e.last_verified_at < now && !isExpired(e, today)) {
      summary.reconfirmed++;
      return { ...e, last_verified_at: now };
    }
    return e;
  });

  // ── 4. Venue reviews (optional)
  if (opts.reviews) {
    const res = await enrichWithReviews(merged, opts.reviews);
    merged = res.events;
    summary.review_lookups = res.lookups;
    summary.review_errors = res.errors;
  }

  // ── 5. Weekly curation keeps volume at the spec's target as feeders multiply
  const active = merged.filter((e) => !isExpired(e, today) && e.status !== "CANCELLED");
  const scoreOf = (e: CalendarEvent) => scores.get(e.id) ?? assessRelevance(e).score;
  const { cut } = curateByWeek(active, scoreOf, opts.maxPerWeek ?? MAX_EVENTS_PER_WEEK);
  const cutNew = new Set(cut.filter((e) => !existingIds.has(e.id)).map((e) => e.id));
  for (const e of cut) if (cutNew.has(e.id)) summary.cut_for_volume.push({ title: e.title, event_date: e.event_date });

  // ── 6. Retire past events (history kept), report stale ones, write
  const toWrite = merged
    .filter((e) => !cutNew.has(e.id))
    .map((e) => {
      if (e.status !== "COMPLETED" && e.status !== "CANCELLED" && isExpired(e, today)) {
        summary.marked_completed++;
        return { ...e, status: "COMPLETED" as const, updated_at: now };
      }
      return e;
    });

  const staleDays = opts.staleAfterDays ?? 14;
  for (const e of toWrite) {
    if (e.status === "COMPLETED" || e.status === "CANCELLED") continue;
    if (daysBetween(e.last_verified_at.slice(0, 10), today) > staleDays) {
      summary.stale.push({ id: e.id, title: e.title, last_verified_at: e.last_verified_at });
    }
  }

  const live = toWrite.filter((e) => !isExpired(e, today) && e.status !== "CANCELLED");
  summary.empty_days = emptyDays(buildCalendarItems(live), today, addDays(today, summary.coverage_days - 1));

  summary.published = accepted.filter((e) => !cutNew.has(e.id)).length;
  summary.finished_at = new Date().toISOString();
  summary.duration_ms = Date.now() - t0;

  if (!opts.dryRun) {
    const writtenIds = new Set(toWrite.map((e) => e.id));
    const toRemove = removedIds.filter((id) => !writtenIds.has(id));
    if (toRemove.length) await opts.repo.remove?.(toRemove);
    await opts.repo.upsert(toWrite);
    await stateStore.putMany(nextStates, sources);
    await opts.repo.logRun?.(summary);
  }
  return summary;
}

function candidateToEvent(c: FeedCandidate, source: Source, now: string): CalendarEvent {
  return toCalendarEvent(c.event, source, now, { cancelled: c.cancelled, pageUrl: c.pageUrl });
}

/** A title repeated on this many dates is a standing program (daily patch hours, weekly classes). */
const SERIES_THRESHOLD = 4;

/**
 * Feeds often list a standing program once per day. Keep only its next upcoming occurrence and
 * note how often it repeats, so the calendar shows it once and weekly curation isn't flooded.
 * Short runs (a few performance dates) are left alone; the UI groups those itself.
 */
export function collapseLongSeries(
  events: CalendarEvent[],
  today: string,
  summary?: Pick<RunSummary, "collapsed_series">,
): CalendarEvent[] {
  const groups = new Map<string, CalendarEvent[]>();
  const out: CalendarEvent[] = [];
  for (const e of events) {
    if (!e.event_date || e.category === "SIGNUP_ALERT" || e.subcategory === "sports") {
      out.push(e);
      continue;
    }
    const key = `${normalizeTitle(e.title)}|${e.source_name}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  for (const list of groups.values()) {
    if (list.length < SERIES_THRESHOLD) {
      out.push(...list);
      continue;
    }
    list.sort((a, b) => a.event_date!.localeCompare(b.event_date!));
    const upcoming = list.filter((e) => (e.end_date ?? e.event_date)! >= today);
    const keep = upcoming[0] ?? list[list.length - 1];
    const last = list[list.length - 1].event_date!;
    const note = `Recurring: listed on ${list.length} dates through ${last}.`;
    out.push({ ...keep, description: keep.description ? `${keep.description} ${note}` : note });
    summary?.collapsed_series.push({ title: keep.title, occurrences: list.length });
  }
  return out;
}

/** Errors caused by a missing or wrong API credential (Anthropic, Reddit, Instagram). */
export function isCredentialError(message: string): boolean {
  return /authentication_error|invalid x-api-key|Reddit token HTTP 40[13]|OAuthException|Invalid OAuth access token/i.test(message);
}
