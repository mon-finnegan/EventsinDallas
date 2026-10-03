-- Feeder robustness: per-source health/caching state, venue review enrichment, run log detail.

alter table public.events
  add column if not exists review_rating     numeric(2,1),
  add column if not exists review_count      integer,
  add column if not exists review_source     text,
  add column if not exists review_url        text;

alter table public.sources
  add column if not exists "group"              text,
  add column if not exists feeder               text not null default 'auto',
  add column if not exists feed_url             text,
  add column if not exists default_city         text,
  add column if not exists max_detail_pages     integer,
  add column if not exists etag                 text,
  add column if not exists last_modified        text,
  add column if not exists content_hash         text,
  add column if not exists last_success_at      timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_feeders         text[],
  add column if not exists last_event_count     integer;

-- Venue reputation cache (Google Places), refreshed at most weekly per venue.
create table if not exists public.venue_reviews (
  venue_key     text primary key,       -- normalized "venue|city"
  rating        numeric(2,1),
  review_count  integer,
  source        text not null,
  url           text,
  fetched_at    timestamptz not null default now()
);
alter table public.venue_reviews enable row level security;
