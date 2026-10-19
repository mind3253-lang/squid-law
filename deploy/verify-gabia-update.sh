#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
expected="$(git rev-parse HEAD)"
test -n "$expected"
if ! systemctl is-active --quiet squidlaw-health.service; then
 echo "POST_UPDATE_HEALTH_SERVICE_INACTIVE"; exit 1
fi
node deploy/inspect-gabia-health.mjs
actual="$(git rev-parse HEAD)"
if [ "$expected" != "$actual" ]; then
 echo "POST_UPDATE_REVISION_CHANGED"; exit 1
fi
if systemctl is-active --quiet squidlaw-worker.service; then
 echo "POST_UPDATE_WORKER_UNEXPECTEDLY_ACTIVE"; exit 1
fi
echo "POST_UPDATE_VERIFIED_REVISION=$actual"
echo "CUSTOMER_API_DATABASE_AI_NOT_VERIFIED"
