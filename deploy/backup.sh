#!/usr/bin/env bash
# RADAR nightly backup. Runs on the server as the "radar" user (see radar-backup.timer).
#
# What it does
#   1. Reads DATABASE_URL from backend/.env (the file is only read, never run).
#   2. Saves everything in the "public" schema (all of RADAR's data) as one readable SQL file, compressed.
#   3. Checks the file before keeping it. A broken or empty backup is thrown away, so it can never replace a good one.
#   4. Keeps the last 14 daily files. Every Sunday's file is also kept in weekly/ (last 12).
#
# Files land in /var/backups/radar. "latest.sql.gz" always points at the newest good one.
set -euo pipefail
umask 027

ENV_FILE="${RADAR_ENV_FILE:-/opt/radar/backend/.env}"
BACKUP_DIR="${RADAR_BACKUP_DIR:-/var/backups/radar}"
KEEP_DAYS="${RADAR_KEEP_DAYS:-14}"
KEEP_WEEKLY="${RADAR_KEEP_WEEKLY:-12}"
PG_DUMP="${PG_DUMP:-pg_dump}"

fail() { echo "BACKUP FAILED: $*" >&2; exit 1; }

[ -r "$ENV_FILE" ] || fail "cannot read $ENV_FILE"
command -v "$PG_DUMP" >/dev/null || fail "pg_dump is not installed (see docs/deployment-guide.md, step 4)"

# Take the value after "DATABASE_URL=", drop surrounding quotes. The file is never executed.
URL="$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
[ -n "$URL" ] || fail "DATABASE_URL is empty in $ENV_FILE"

mkdir -p "$BACKUP_DIR/weekly"
STAMP="$(date -u +%Y-%m-%d-%H%M)"
OUT="$BACKUP_DIR/radar-$STAMP.sql.gz"
PART="$OUT.partial"
trap 'rm -f "$PART"' EXIT

# Split the address into PGHOST, PGUSER, ... so the password never shows in the process list.
# --column-inserts keeps the file plain SQL that any Postgres, or "npm run backup:check", can read.
. "$(dirname "$(readlink -f "$0")")/lib-dburl.sh"
export_pg_env "$URL" || fail "could not read DATABASE_URL"
"$PG_DUMP" \
  --schema=public --no-owner --no-privileges \
  --column-inserts --rows-per-insert=100 \
  --lock-wait-timeout=60000 \
  | sed 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' \
  | gzip -9 > "$PART" || fail "pg_dump stopped with an error"

# Is it really a backup?
gzip -t "$PART" || fail "the file is not a valid gzip file"
SIZE="$(stat -c %s "$PART")"
[ "$SIZE" -gt 2000 ] || fail "the file is suspiciously small ($SIZE bytes)"
for t in households users segments items; do
  FOUND="$(zcat "$PART" | grep -c "^CREATE TABLE public\.$t " || true)"
  [ "$FOUND" -ge 1 ] || fail "table $t is not in the file"
done

# Every table must be locked (row level security on). The dump records this, so the nightly backup doubles as a check.
TABLES="$(zcat "$PART" | grep -c '^CREATE TABLE public\.' || true)"
LOCKED="$(zcat "$PART" | grep -c '^ALTER TABLE public\..* ENABLE ROW LEVEL SECURITY;' || true)"
LOCK_NOTE="all $TABLES tables locked"
if [ "$LOCKED" -lt "$TABLES" ]; then
  LOCK_NOTE="WARNING: only $LOCKED of $TABLES tables have row level security on"
  echo "$LOCK_NOTE" >&2
fi

mv "$PART" "$OUT"
ln -sfn "$(basename "$OUT")" "$BACKUP_DIR/latest.sql.gz"

# Sundays: also keep a copy for the weekly set
if [ "$(date -u +%u)" = "7" ]; then
  cp "$OUT" "$BACKUP_DIR/weekly/"
fi

# Tidy up old files
find "$BACKUP_DIR" -maxdepth 1 -name 'radar-*.sql.gz' -mtime +"$((KEEP_DAYS - 1))" -delete
ls -1t "$BACKUP_DIR"/weekly/radar-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | xargs -r rm -f

echo "Backup OK: $(basename "$OUT"), $SIZE bytes, $(ls -1 "$BACKUP_DIR"/radar-*.sql.gz | wc -l) daily files kept; $LOCK_NOTE."
echo "$(date -u +%FT%TZ) ok $(basename "$OUT") $SIZE $LOCK_NOTE" > "$BACKUP_DIR/last-backup.txt"
