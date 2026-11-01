#!/usr/bin/env bash
# Puts a RADAR backup into an EMPTY database. Run on the server, or anywhere with psql installed.
#
#   RESTORE_DATABASE_URL='postgresql://...' bash deploy/restore.sh /var/backups/radar/latest.sql.gz
#
# The target address is never taken from backend/.env on purpose: you must type it, so a restore can't
# accidentally land on top of the live database. It also refuses to continue if the target already has RADAR tables.
set -euo pipefail

FILE="${1:-}"
URL="${RESTORE_DATABASE_URL:-}"
[ -n "$FILE" ] && [ -r "$FILE" ] || { echo "Usage: RESTORE_DATABASE_URL='postgresql://...' bash deploy/restore.sh path/to/backup.sql.gz" >&2; exit 1; }
[ -n "$URL" ] || { echo "Set RESTORE_DATABASE_URL to the database you want to restore INTO (an empty one)." >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is not installed." >&2; exit 1; }

. "$(dirname "$(readlink -f "$0")")/lib-dburl.sh"
export_pg_env "$URL" || exit 1

EXISTING="$(psql -Atq -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('items','users','households')")"
if [ "$EXISTING" != "0" ]; then
  echo "Stopped: that database already has RADAR tables ($EXISTING found). Restore into an empty database." >&2
  exit 1
fi

echo "Restoring $FILE ..."
case "$FILE" in
  *.gz) gunzip -c "$FILE" ;;
  *) cat "$FILE" ;;
esac | sed 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' | psql -q -v ON_ERROR_STOP=1 --single-transaction -f - >/dev/null

# A fresh Supabase project gives its public roles access to new tables. Take that away again, as the migrations do.
# (The tables are also locked by row level security, so this is a second lock.)
psql -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
    end if;
  end loop;
end $$;
SQL

echo "Done. Row counts now in the target database:"
psql -c "select 'households' as t, count(*) from households union all select 'users', count(*) from users union all select 'segments', count(*) from segments union all select 'items', count(*) from items"
echo "Next: put the new DATABASE_URL in backend/.env on the server and restart: sudo systemctl restart radar-api"
