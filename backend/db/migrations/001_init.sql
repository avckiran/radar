-- Row-level security is ON for every table with NO policies: only the backend can read data.
drop table if exists hello_world;

create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  time_zone   text not null default 'America/New_York',
  nudge_days  integer not null default 5 check (nudge_days between 1 and 60),
  created_at  timestamptz not null default now()
);

create table users (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  username       text not null,
  display_name   text not null,
  email          text,
  password_hash  text,
  is_owner       boolean not null default false,
  digest_time    time not null default '08:00',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index users_username_key on users (lower(username));
create unique index users_email_key on users (lower(email)) where email is not null;

create table segments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  name           text not null,
  color          text not null check (color in
                   ('emerald','rose','blue','violet','slate','teal','lime','indigo','magenta','brown','sky','stone')),
  sort_order     integer not null default 0,
  protected      boolean not null default false,
  allowed_kinds  text[] not null default '{action,note,link}',
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index segments_name_key on segments (household_id, lower(name)) where deleted_at is null;

create table items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  segment_id      uuid references segments(id),
  kind            text not null check (kind in ('action','note','link')),
  state           text not null default 'inbox' check (state in ('inbox','active','waiting','snoozed','done')),
  title           text not null,
  body            text,
  url             text,
  description     text,
  due_date        date,
  snoozed_until   date,
  waiting_on      text,
  follow_up_date  date,
  waiting_since   timestamptz,
  completed_at    timestamptz,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint items_kind_state check (kind = 'action' or state in ('inbox','active')),
  constraint items_no_due_on_notes check (kind = 'action' or due_date is null),
  constraint items_link_needs_url check (kind <> 'link' or url is not null),

  constraint items_segment_when_working check (state not in ('active','waiting','snoozed') or segment_id is not null),
  constraint items_waiting_since check (state <> 'waiting' or waiting_since is not null),
  constraint items_snoozed_until check (state <> 'snoozed' or snoozed_until is not null)
);
create index items_household_state on items (household_id, state) where deleted_at is null;
create index items_segment on items (segment_id) where deleted_at is null;

-- Append-only history: the app only ever inserts here.
create table item_events (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  household_id  uuid not null references households(id) on delete cascade,
  type          text not null check (type in ('created','edited','state_change','follow_up','completed','deleted','restored')),
  from_state    text,
  to_state      text,
  note          text,
  data          jsonb not null default '{}',
  actor_id      uuid references users(id),
  created_at    timestamptz not null default now()
);
create index item_events_item on item_events (item_id, created_at);

create table password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table digest_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  local_date  date not null,
  status      text not null check (status in ('sent','failed')),
  attempts    integer not null default 1,
  error       text,
  sent_at     timestamptz not null default now(),
  unique (user_id, local_date)
);

alter table households            enable row level security;
alter table users                 enable row level security;
alter table segments              enable row level security;
alter table items                 enable row level security;
alter table item_events           enable row level security;
alter table password_reset_tokens enable row level security;
alter table digest_log            enable row level security;

-- Also revoke Supabase's default table rights (guarded: these roles only exist on Supabase)
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
    end if;
  end loop;
end $$;
