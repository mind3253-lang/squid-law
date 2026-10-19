#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/lock/squidlaw-auto-update.lock
flock -n 9 || exit 0
cd /opt/squidlaw/app
status_file=/var/lib/squidlaw/auto-update-status.json
record_status() {
 local outcome="$1" revision
 revision="$(git rev-parse HEAD 2>/dev/null || true)"
 mkdir -p /var/lib/squidlaw
 STATUS_OUTCOME="$outcome" STATUS_REVISION="$revision" node -e '
 const fs=require("node:fs");
 fs.writeFileSync(process.argv[1],JSON.stringify({
  outcome:process.env.STATUS_OUTCOME,revision:process.env.STATUS_REVISION,
  recordedAt:new Date().toISOString()
 })+String.fromCharCode(10),{mode:0o600});
 ' "$status_file"
}
if systemctl is-active --quiet squidlaw-worker.service; then
 record_status skipped_worker_active
 echo "AUTO_UPDATE_SKIPPED_WORKER_ACTIVE"; exit 0
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
 record_status skipped_local_changes
 echo "AUTO_UPDATE_SKIPPED_LOCAL_CHANGES"; exit 0
fi
if ! git fetch origin main; then
 record_status fetch_failed
 exit 1
fi
current="$(git rev-parse HEAD)"
target="$(git rev-parse origin/main)"
if [ "$current" = "$target" ]; then
 record_status already_current
 echo "AUTO_UPDATE_ALREADY_CURRENT=$current"; exit 0
fi
if ! git merge-base --is-ancestor "$current" "$target"; then
 record_status skipped_non_fast_forward
 echo "AUTO_UPDATE_SKIPPED_NON_FAST_FORWARD"; exit 1
fi
echo "AUTO_UPDATE_FROM=$current TO=$target"
if ! bash deploy/update-worker-code.sh; then
 record_status update_failed
 exit 1
fi
record_status applied
echo "AUTO_UPDATE_APPLIED=$(git rev-parse HEAD)"
