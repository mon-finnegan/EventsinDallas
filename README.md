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

Without any environment variables the app serves the bundled seed dataset (`src/data/seed.ts`): 24 real Oct 2026 – Jun 2027 listings, each with its source.

## Features (P0)

| Spec | Where |
| --- | --- |
| Month / Week / List / Don't Miss views (§13, §16, §17) | `src/components/views.tsx`, `CalendarApp.tsx` |
| Click an event to open a detail panel; the calendar stays visible (§14, §15) | `src/components/DetailPanel.tsx` (side panel on desktop, bottom sheet on phones) |
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

## Data pipeline

```
SOURCES (src/lib/pipeline/sources.ts)
  → fetch page → Claude structured extraction (claude-opus-5-5, Zod schema)
  → evidence check → validation → relevance filter → dedupe against stored rows
  → upsert to Supabase; past events marked COMPLETED
```

- **Vercel:** `vercel.json` calls `GET /api/cron/refresh` every day at 11:00 UTC (6 AM in Dallas). The route requires `Authorization: Bearer $CRON_SECRET`.
- **Anywhere else** (GitHub Actions, local): `npm run refresh` runs every source, or `npm run refresh -- klyde-warren dallas-zoo` runs just those.
- Each run returns a summary: sources that failed, fields dropped for missing evidence, records rejected with reasons, and how many were published.

To add coverage, add official pages to `SOURCES` (church calendars, the Diocese of Dallas, venue calendars, national ticket pages). Don't hard-code events.

## Supabase setup

1. Create a project and run `supabase/migrations/0001_init.sql`.
2. Copy `.env.example` to `.env.local` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` and `CRON_SECRET`.
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
