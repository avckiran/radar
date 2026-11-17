-- Schedules are versions: a change adds a row that applies from that day on, and pausing is a version of kind 'paused'.
create table trackers (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  owner_id      uuid not null references users(id),
  scope         text not null default 'personal' check (scope in ('personal', 'household')),
  title         text not null check (length(btrim(title)) between 1 and 80),
  note          text check (note is null or length(note) <= 500),
  part          text not null default 'anytime' check (part in ('morning', 'afternoon', 'evening', 'anytime')),
  start_date    date not null,
  end_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (end_date is null or end_date >= start_date)
);
create index trackers_household on trackers (household_id) where deleted_at is null;

create table tracker_schedules (
  id             uuid primary key default gen_random_uuid(),
  -- orders versions that start on the same day
  seq            bigint generated always as identity,
  tracker_id     uuid not null references trackers(id) on delete cascade,
  household_id   uuid not null references households(id) on delete cascade,
  effective_from date not null,
  kind           text not null check (kind in ('days', 'interval', 'weekly', 'paused')),
  -- 'days': weekdays, 0 = Sunday ... 6 = Saturday
  days           smallint[],
  -- 'interval': every N days counted from anchor_date
  interval_days  smallint,
  anchor_date    date,
  per_week       smallint,
  created_at     timestamptz not null default now(),
  check (
    (kind = 'days' and days is not null and cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
    or (kind = 'interval' and interval_days between 2 and 30 and anchor_date is not null)
    or (kind = 'weekly' and per_week between 1 and 6)
    or (kind = 'paused')
  )
);
create index tracker_schedules_tracker on tracker_schedules (tracker_id, effective_from, seq);

create table tracker_checkins (
  id            uuid primary key default gen_random_uuid(),
  tracker_id    uuid not null references trackers(id) on delete cascade,
  household_id  uuid not null references households(id) on delete cascade,
  local_date    date not null,
  status        text not null check (status in ('done', 'skipped')),
  note          text check (note is null or length(note) <= 200),
  user_id       uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tracker_id, local_date)
);
create index tracker_checkins_household on tracker_checkins (household_id, local_date);

alter table trackers enable row level security;
alter table tracker_schedules enable row level security;
alter table tracker_checkins enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table trackers from %I', r);
      execute format('revoke all on table tracker_schedules from %I', r);
      execute format('revoke all on table tracker_checkins from %I', r);
    end if;
  end loop;
end $$;
