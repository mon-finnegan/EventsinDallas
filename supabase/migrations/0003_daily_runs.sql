-- Confirmed daily runs ("ongoing" days on the calendar) and their closures.
alter table public.events
  add column if not exists open_daily   boolean not null default false,
  add column if not exists closed_dates date[]  not null default '{}';
