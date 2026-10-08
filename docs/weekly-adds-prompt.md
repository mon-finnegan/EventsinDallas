# Weekly adds — canned prompt

Paste this into a Claude Code session on the `mon-finnegan/EventsinDallas` repo (or let the weekly
Routine run it for you). It researches new events with web search and adds them to the hand-curated
seed, so no Anthropic API key or credits are needed.

---

You are maintaining "Mon's Dallas List" (repo mon-finnegan/EventsinDallas, branch
`claude/dallas-family-calendar-spec-8jf0o2`; Vercel redeploys on every push to it). Read AGENTS.md
first. Your job this run: research and add the best new events for the next ~3 months, then ship.

1. Get oriented (today's date matters):
   - `git checkout claude/dallas-family-calendar-spec-8jf0o2 && git pull`
   - Read `src/data/seed.ts` (the `ev({...})` pattern and existing ids/titles) and
     `src/data/last-run.json` (`empty_days` = upcoming days with nothing on the calendar).
   - Never add something already present in `seed.ts` or `src/data/collected.json` (match by title,
     date and venue, not just id).

2. Research with web search, newest information only, in this priority order:
   a. National bucket-list and selective-access events: White House tours/lotteries (garden tours,
      holiday tours via Congress, National Christmas Tree lottery, Easter Egg Roll lottery), Capitol
      and landmark tree lightings, candlelight estate tours, public launch viewings, golf majors,
      Olympics, CFP/bowl games, Super Bowl, Derby, Masters/Wimbledon ballots, NFL Draft, Rose Parade.
      Capture lottery/ticket windows as SIGNUP_ALERT records with signup dates when announced.
   b. Fill every date listed in `empty_days`, then any day in the next 30 days with fewer than two
      events, with one-off DFW events: toddler/family (ages 1–3), grown-up outings a 30-something
      couple would love (food & wine, live music, comedy, culture nights), top-tier networking, and
      community/church festivals open to the public (never ordinary church programming).
   c. Major DFW sports only (openers, rivalries, holiday/national-TV games, championships, bowls).
   Prefer sources with lots of reviews or attendance data; mention review counts in
   `verification_note` when you find them.

3. Rules for every record (these are strict):
   - No guessing. Dates, times, prices and ages come from a source you actually read this run;
     anything not stated stays null. If only last year's details exist, leave the value null and
     say so in `verification_note`.
   - `source_url` must be the page that states the facts; prefer official pages over news.
   - Multi-day runs are one record (`event_date` + `end_date`), never one per day.
   - National items: `scope: "NATIONAL"` with `national_interest` (`exclusive_access` for selective
     public openings), plus `timezone`, `city` and `state`.
   - Fill `cost` with the stated admission ("Free", "$11.25; kids under 10 free") when the source
     gives it.
   - Set `last_verified_at` to now (ISO) on new records.
   - Add 8–20 records, best and most distinctive first, under a comment line
     `// ───────────── Added <today>: weekly adds ─────────────`.

4. Verify, then ship:
   - `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run build` must all pass. Fix
     anything you broke; if a test caps counts (e.g. local sports), stay within it rather than
     editing the test.
   - Commit with a message listing what was added, then `git push origin
     claude/dallas-family-calendar-spec-8jf0o2`.

5. Finish with a short summary: a table of what you added (date, event, how to get in) with
   markdown source links, anything you skipped and why, and which `empty_days` are still empty.

Do not change secrets, workflows or app code in this run — data only.
