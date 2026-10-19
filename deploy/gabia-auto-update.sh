#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/lock/squidlaw-auto-update.lock
flock -n 9 || exit 0
cd /opt/squidlaw/app
if systemctl is-active --quiet squidlaw-worker.service; then
 echo "AUTO_UPDATE_SKIPPED_WORKER_ACTIVE"; exit 0
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
 echo "AUTO_UPDATE_SKIPPED_LOCAL_CHANGES"; exit 0
fi
git fetch origin main
current="$(git rev-parse HEAD)"
target="$(git rev-parse origin/main)"
if [ "$current" = "$target" ]; then
 echo "AUTO_UPDATE_ALREADY_CURRENT=$current"; exit 0
fi
if ! git merge-base --is-ancestor "$current" "$target"; then
 echo "AUTO_UPDATE_SKIPPED_NON_FAST_FORWARD"; exit 1
fi
echo "AUTO_UPDATE_FROM=$current TO=$target"
bash deploy/update-worker-code.sh
echo "AUTO_UPDATE_APPLIED=$(git rev-parse HEAD)"
