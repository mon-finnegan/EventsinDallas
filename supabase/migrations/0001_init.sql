-- Dallas Family Calendar — initial schema (spec §18, §31).
-- Nullable date/time columns mean "not verified" (spec §12): never backfill with guesses.

create table if not exists public.events (
  id                 text primary key,
  title              text not null,
  description        text,
  category           text not null check (category in ('DALLAS_EVENT','TODDLER_EVENT','SIGNUP_ALERT')),
  subcategory        text,
  scope              text not null default 'DALLAS' check (scope in ('DALLAS','NATIONAL')),
  national_interest  text check (national_interest in ('golf','major_sports','olympics','special_experiences')),

  event_date         date,
  end_date           date,
  start_time         time,
  end_time           time,
  timezone           text not null default 'America/Chicago',

  venue              text,
  address            text,
  city               text,
  state              text,

  age_min            smallint,
  age_max            smallint,
  age_label          text,
  cost               text,
  activities         text[] not null default '{}',

  is_toddler_relevant boolean not null default false,
  is_family_relevant  boolean not null default true,
  is_church_hosted    boolean not null default false,
  is_public_event     boolean not null default true,
  is_seasonal         boolean not null default false,

  signup_required    boolean not null default false,
  signup_type        text check (signup_type in ('RESERVATION','REGISTRATION','TICKET_RELEASE','LOTTERY','APPLICATION','LIMITED_REGISTRATION','OTHER')),
  -- Action dates are text: either 'YYYY-MM-DD' (day confirmed, time unknown) or a full
  -- ISO-8601 timestamp with offset (time confirmed). A timestamptz would force a fake time.
  signup_open_at     text,
  signup_close_at    text,
  lottery_open_at    text,
  lottery_close_at   text,
  ticket_release_at  text,
  action_note        text,

  event_url          text,
  registration_url   text,
  ticket_url         text,

  source_name        text not null,
  source_url         text not null,
  source_type        text not null check (source_type in ('official_event','official_venue','official_organization','official_municipal','official_ticketing','local_calendar')),
  verification_note  text,

  status             text not null default 'UPCOMING' check (status in ('UPCOMING','REGISTRATION_OPEN','REGISTRATION_CLOSED','SOLD_OUT','CANCELLED','COMPLETED','UNKNOWN')),
  last_verified_at   timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint end_after_start check (end_date is null or event_date is null or end_date >= event_date)
);

create index if not exists events_event_date_idx on public.events (event_date);
create index if not exists events_category_idx on public.events (category);

-- Source registry for the daily discovery pipeline (spec §20, §27).
create table if not exists public.sources (
  id           text primary key,
  name         text not null,
  url          text not null,
  source_type  text not null,
  kind         text not null default 'event_page', -- event_page | calendar | church | diocese | national
  is_church    boolean not null default false,
  active       boolean not null default true,
  last_run_at  timestamptz,
  last_error   text
);

-- Pipeline audit log: what each run found, rejected and why.
create table if not exists public.pipeline_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  summary     jsonb
);

-- Read-only public access for the calendar; writes happen with the service role key only.
alter table public.events enable row level security;
alter table public.sources enable row level security;
alter table public.pipeline_runs enable row level security;

drop policy if exists "events are publicly readable" on public.events;
create policy "events are publicly readable" on public.events for select using (true);
