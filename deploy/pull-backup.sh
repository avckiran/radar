#!/usr/bin/env bash
# Copies the newest RADAR backup from the server to THIS computer (your home computer).
# Run it by hand, or let your computer run it every week (see docs/deployment-guide.md, step 9).
#
#   bash pull-backup.sh YOUR_USERNAME_ON_THE_SERVER
#
# It needs Tailscale installed and signed in on this computer (the server is called radar-server).
# Copies go to ~/RADAR-backups. The newest 12 are kept; older ones are removed.
set -euo pipefail

VM_USER="${1:-${RADAR_VM_USER:-}}"
HOST="${RADAR_VM_HOST:-radar-server}"
DEST="${RADAR_LOCAL_BACKUPS:-$HOME/RADAR-backups}"
KEEP="${RADAR_LOCAL_KEEP:-12}"

say() { echo "$@"; }
alert() {
  say "PROBLEM: $*" >&2
  command -v osascript >/dev/null && osascript -e "display notification \"$*\" with title \"RADAR backup\"" || true
  exit 1
}

[ -n "$VM_USER" ] || alert "give your username on the server: bash pull-backup.sh YOUR_USERNAME"
mkdir -p "$DEST"
chmod 700 "$DEST"

REMOTE_DIR=/var/backups/radar
NEWEST="$(ssh -o ConnectTimeout=20 -o BatchMode=yes "$VM_USER@$HOST" "readlink -f $REMOTE_DIR/latest.sql.gz" 2>/dev/null)" \
  || alert "could not reach $HOST. Is Tailscale on and signed in on this computer?"
NAME="$(basename "$NEWEST")"
[ -n "$NAME" ] || alert "the server has no backup yet"

if [ -s "$DEST/$NAME" ]; then
  say "Already have $NAME. Nothing to do."
else
  scp -q -o ConnectTimeout=20 -o BatchMode=yes "$VM_USER@$HOST:$NEWEST" "$DEST/$NAME.partial" \
    || alert "could not copy $NAME from the server"
  gzip -t "$DEST/$NAME.partial" || { rm -f "$DEST/$NAME.partial"; alert "the downloaded file is damaged"; }
  mv "$DEST/$NAME.partial" "$DEST/$NAME"
  say "Saved $DEST/$NAME"
fi

# How old is the newest backup on the server? More than 3 days means the nightly backup has stopped.
AGE_DAYS="$(ssh -o ConnectTimeout=20 -o BatchMode=yes "$VM_USER@$HOST" "echo \$(( (\$(date +%s) - \$(stat -c %Y $NEWEST)) / 86400 ))" 2>/dev/null || echo 0)"
[ "$AGE_DAYS" -le 3 ] || alert "the newest backup on the server is $AGE_DAYS days old. The nightly backup may have stopped."

# Keep the newest few
ls -1t "$DEST"/radar-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -I{} rm -f "{}"
say "Backups on this computer: $(ls -1 "$DEST"/radar-*.sql.gz | wc -l)"
