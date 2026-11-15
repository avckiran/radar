-- Web push notifications. Each phone or computer that turns notifications on saves one subscription here
-- (the address Apple, Google or Mozilla gave it, plus the keys needed to encrypt a message for it).
-- Row-level security is ON with NO policies: only the backend can read data.
create table push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  household_id     uuid not null references households(id) on delete cascade,
  endpoint         text not null unique check (length(endpoint) between 1 and 2000),
  p256dh           text not null check (length(p256dh) between 1 and 200),
  auth             text not null check (length(auth) between 1 and 100),
  label            text not null default 'Device' check (length(label) between 1 and 40),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  last_error       text
);
create index push_subscriptions_user on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;

-- Per person, per slot: also send it as a notification. Off until the person turns it on.
alter table users add column digest_morning_push   boolean not null default false;
alter table users add column digest_afternoon_push boolean not null default false;
alter table users add column digest_evening_push   boolean not null default false;

-- The log now has one row per person, per day, per slot AND per way of sending (email or push),
-- so a notification and an email for the same slot can never block each other.
alter table digest_log add column channel text not null default 'email' check (channel in ('email', 'push'));
alter table digest_log drop constraint digest_log_user_day_slot_key;
alter table digest_log add constraint digest_log_user_day_slot_channel_key unique (user_id, local_date, slot, channel);

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table push_subscriptions from %I', r);
    end if;
  end loop;
end $$;
