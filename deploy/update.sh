#!/usr/bin/env bash
# Brings the server up to date with the latest code on GitHub. Run on the server as yourself (not as radar):
#     bash /opt/radar/deploy/update.sh
# It is safe to run any time. If nothing changed it just restarts the app.
set -euo pipefail
cd /opt/radar

echo "Downloading the latest code ..."
sudo -u radar git pull --ff-only

echo "Installing what the server needs ..."
sudo -u radar npm ci --omit=dev -w backend

echo "Updating the database structure (does nothing if it is already current) ..."
(cd backend && sudo -u radar npm run --silent db:migrate)

echo "Refreshing the service files ..."
sudo install -m 644 deploy/radar-api.service deploy/radar-backup.service deploy/radar-backup.timer deploy/radar-backup-failed.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now radar-backup.timer >/dev/null

echo "Restarting RADAR ..."
sudo systemctl restart radar-api
sleep 3
systemctl is-active radar-api
curl -fsS http://127.0.0.1:3001/health && echo || echo "(health check did not answer: look at: sudo journalctl -u radar-api -n 50)"
