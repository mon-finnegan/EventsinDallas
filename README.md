# Dallas Family Calendar

A curated Dallas/DFW calendar for families with 1–3 year olds. It answers two questions:

1. **What's actually worth doing this month?** Dallas events (blue), toddler and family events (green), including public church and community festivals.
2. **What do I need to sign up for before I miss it?** A *reverse calendar* (red) that puts reservation, registration, ticket-release and lottery dates on the day you need to act.

Built from the v2.0 product spec: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, with optional Supabase/Postgres and a daily Claude-powered discovery pipeline.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: validation, reverse calendar, dedupe, relevance, pipeline
npm run lint && npm run typecheck && npm run build
```

`npm run build:static` writes `dist/index.html`: a single self-contained page with the same calendar and seed data, which can be hosted anywhere without a server.

Without any environment variables the app serves the bundled seed dataset (`src/data/seed.ts`): about 50 real listings from Oct 2026 to Jun 2027, each with its source.

## Features (P0)

| Spec | Where |
| --- | --- |
| Month / Week / List / Don't Miss views (§13, §16, §17). Weeks run Sunday to Saturday. Each day lists its best events first, and the top pick gets a ★. | `src/components/views.tsx`, `CalendarApp.tsx` |
| Click an event to open a detail panel; the calendar stays visible (§14, §15) | `src/components/DetailPanel.tsx` (side panel on desktop, bottom sheet on phones) |
| No repeats: each event appears once. Multi-day events and long runs show only on their first day ("First day: …"); the date range, daily hours and closures are in the details. If the same event is listed on several dates (weekly storytime, a run of performances), only its next date is shown and the details list the others. Separate games and signup dates are never merged. | `buildCalendarItems`, `collapseRepeats` in `src/lib/calendar.ts` |
| Reverse calendar: event date and action date tracked separately (§10, §11) | `buildCalendarItems` in `src/lib/calendar.ts` |
| No guessing: unknown values are `null` and shown as "Date not yet announced" (§12) | `src/lib/validation.ts`, evidence check in `src/lib/pipeline/extract.ts` |
| Church event filter: festivals in, Bible studies out (§5–7, §21) | `src/lib/relevance.ts` |
| Relevance scoring (internal only) and the 30-mile geography (§22, §23) | `src/lib/relevance.ts` |
| Deduplication that prefers the official source (§26, §30) | `src/lib/dedupe.ts` |
| Expired events drop off the calendar but stay in the history (§31) | `isExpired`; the pipeline marks them `COMPLETED` |
| Preferences: categories, church, national interests (§33) | `src/lib/filters.ts`, Filters panel (saved per browser) |
| Daily refresh pipeline (§27, §28) | `src/lib/pipeline/*`, `/api/cron/refresh`, `vercel.json` |
| Postgres schema (§18, §32) | `supabase/migrations/0001_init.sql` |

### How "no guessing" is enforced

- **Data model:** a date or time is either verified or `null`. Action timestamps can be a bare day (`2026-10-15`, time unknown) or a full ISO timestamp with an offset. Nothing ever fills in a fake `00:00`.
- **Publishing gate** (`validateForPublish`): every record needs a specific date, a source URL and a location (or a national interest). A signup alert needs a confirmed action type. Church events must be public.
- **AI extraction:** for every date or time it extracts, Claude must quote the exact text from the source page. `enforceEvidence` throws away any value whose quote doesn't appear on the page. The prompt also tells the model never to turn phrases like "first Tuesday of October" into a date.
- **UI:** dates show a "Confirmed" badge or "Date not yet announced". Every detail panel links to the source and shows when it was last verified.

## Data pipeline (feeders)

```
SOURCES (~50 feeders: churches, venues, cities, performing arts, aggregators, national)
  → due today? (sources that keep failing back off: 1, 2, 4, 8, then 14 days)
  → feeder, cheapest and most trustworthy first:
      1. WordPress "The Events Calendar" REST API   (structured, exact dates)
      2. iCal feed (advertised .ics, Squarespace ?format=ical, or a configured feed_url)
      3. schema.org JSON-LD Event markup on the page
      4. Claude extraction of the page + linked event detail pages (every date quote-checked)
  → validation → relevance → dedupe against stored rows (official source wins)
  → venue review counts (optional, Google Places) → weekly curation cap (20/week; signup alerts never cut)
  → Supabase; past events marked COMPLETED; run summary saved to pipeline_runs
```

**How it holds up as sources grow:**

- **Polite, resilient HTTP** (`src/lib/pipeline/http.ts`). Retries with backoff on 429/5xx and network errors, honors `Retry-After`, has timeouts and a size cap, respects robots.txt, and spaces out requests to the same host.
- **Change detection.** Conditional GETs (ETag / Last-Modified) plus a content hash. When a page hasn't changed, Claude isn't called again and the page's events are marked re-confirmed.
- **Failure isolation.** One broken source never stops the run. Failures are recorded per source, with consecutive-failure counts and the last error.
- **Structured first.** Feeds with real calendar data skip AI entirely, so they cost nothing and can't hallucinate. AI is the fallback, and every date it returns must quote the page.
- **Volume control.** `curateByWeek` keeps the calendar near the spec's 5–20 good events per week by internal score. Well-reviewed venues rank higher when review data is available.
- **Observability.** Each run reports the sources that failed, were unchanged, or came back empty (often a site redesign), the feeders used, rejections with reasons, events cut for volume, and stale events (not re-verified in 14 days).

**Rolling coverage.** Monthly guides (Dallas Moms, Eventbrite's month pages) use `{monthName}` URL templates that are read for this month and the next. Each run reports `empty_days`: days in the next 30 with nothing specific scheduled, so gaps show up before the month arrives.

**Event guides and Instagram.** Running guides (Dallasites101, Resident, The Scout Guide, Visit Dallas, CultureMap, Do214, Mommy Poppins, Plano Moms, DFWChild) are read as lower-trust discovery sources. When the same event also appears on its official page, the official version wins.
- Instagram accounts (@dallasites101, @dallasmoms, @dfwchild, @visitdallas, @klydewarrenpark, @dallasarboretum, @dallaszoo, @perotmuseum, @do214, @dallasobserver, @dmagazine, @culturemapdallas) are read through Instagram's official Graph API (Business Discovery). Scraping instagram.com is against Instagram's terms and blocked for bots.
- The API needs `IG_USER_ID` and `IG_ACCESS_TOKEN` from an Instagram Business or Creator account.
- Only recent posts that mention a date are sent to Claude. Every extracted date must quote the caption.

**Reddit and Facebook.**
- **Reddit:** r/Dallas, r/askdfw, r/dfw, r/FortWorth and r/Plano are read through Reddit's official API (application-only OAuth; `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`). Only posts from the last week that name a date and have a few upvotes go to Claude, and events found there are labeled as coming from a community post.
- **Facebook:** Facebook groups can't be read programmatically. The Groups API was retired, most groups are private, and scraping is against Facebook's terms. Public Facebook events reach the calendar through AllEvents, which indexes them, as a rolling monthly source.

**Audience.** Besides family picks, the calendar includes activities for 30+ year-olds: food and wine festivals, whiskey tastings, headline concerts, opera and Halloween bar crawls. They have their own filter. Sports are limited to major games (home openers, rivalries, holiday and national-TV games, bowls), and the relevance filter drops regular-season games from every feed.

**Running it (the daily batch):**

- **GitHub Actions (primary):** `.github/workflows/refresh.yml` runs every morning at 6:23 AM Dallas time, and you can also start it by hand from the Actions tab. It runs `npm run refresh -- --store file`, which writes `src/data/collected.json`, `source-state.json` and `last-run.json`, then commits them. Vercel sees the push and redeploys the site. No database is needed.
  - With no secrets it still collects from structured feeds (WordPress event calendars, iCal feeds, schema.org event data).
  - Repository secrets unlock more: `ANTHROPIC_API_KEY` (AI extraction for pages, Instagram and Reddit), `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, `IG_USER_ID`/`IG_ACCESS_TOKEN` and `GOOGLE_PLACES_API_KEY`.
  - The repository variable `AI_CALL_BUDGET` caps AI calls per run (default 150).
  - Each run writes a summary to the run's page.
- **Supabase (optional):** if `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, the same pipeline writes to Postgres instead. `GET /api/cron/refresh` (with `Authorization: Bearer $CRON_SECRET`) can then trigger it from a scheduler.
- **CLI:** `npm run refresh` with `-- --dry-run`, `-- --force`, `-- --group church`, `-- --store file`, or specific source ids such as `-- klyde-warren perot`.

**Adding a feeder:** run `npm run discover -- https://some-church.org/events` to see what the pipeline can read there (WordPress API, iCal, JSON-LD, or AI only). Then paste the printed entry into `SOURCES` in `src/lib/pipeline/sources.ts`. Don't hard-code events.

## Supabase setup

1. Create a project and run `supabase/migrations/0001_init.sql`, then `0002_feeders.sql` and `0003_daily_runs.sql`.
2. Copy `.env.example` to `.env.local` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` and optionally `GOOGLE_PLACES_API_KEY`.
3. `npm run seed` loads the verified seed data. After that, the daily pipeline keeps it current.

The app reads with the anon key (row-level security allows public `select` only). Only the pipeline writes, using the service-role key.

## Seed data notes

The seed was researched on 2026-10-03. Some facts were left out on purpose rather than guessed:

- **French Room Holiday Tea:** The Adolphus says reservations open "the first Tuesday of October", but no 2026 date or time was confirmed. It's listed under *Watching — date not yet announced*.
- **Dallas Arboretum Breakfast with Santa:** the listed dates (Dec 19–21) look like they may be from an earlier year, so it's left out until confirmed.
- **Trains at NorthPark:** 2026 prices aren't published yet, so the cost is blank.
- **Already closed:** the 2027 Masters application (June), the Ryder Cup 2027 ballot (June) and the LA28 draw registration (March). The pipeline watches those sources for the next windows.

## Phase 2 (not built)

Notifications (§34): a day-before alert, a one-hour alert, new-opportunity alerts and closing-deadline reminders. The `actionDates()` helper already gives the schedule these alerts would need.
