-- Shopping lists: one list per store or purpose, each with items that can be checked off.
-- A list is archived (archived_at) when everything on it is checked or when it is archived by hand.
-- Nothing is removed by the app: deleting only sets deleted_at.
-- Row-level security is ON for both tables with NO policies: only the backend can read data.
create table shopping_lists (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 80),
  note          text check (note is null or length(note) <= 500),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  archived_by   uuid references users(id),
  deleted_at    timestamptz
);
create index shopping_lists_household on shopping_lists (household_id) where deleted_at is null;

create table shopping_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references shopping_lists(id) on delete cascade,
  household_id  uuid not null references households(id) on delete cascade,
  -- keeps the order items were added in, even when several are added in the same instant
  seq           bigint generated always as identity,
  text          text not null check (length(btrim(text)) between 1 and 200),
  checked_at    timestamptz,
  checked_by    uuid references users(id),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index shopping_items_list on shopping_items (list_id, seq) where deleted_at is null;

alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table shopping_lists from %I', r);
      execute format('revoke all on table shopping_items from %I', r);
    end if;
  end loop;
end $$;
