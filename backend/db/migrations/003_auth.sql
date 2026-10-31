-- One row per sign-in. Signing out (or changing a password) revokes the row, so the token stops working at once.
create table auth_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index auth_sessions_user on auth_sessions (user_id);

alter table auth_sessions enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table auth_sessions from %I', r);
    end if;
  end loop;
end $$;
