#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
if systemctl is-active --quiet squidlaw-worker.service; then
 echo "REFUSING_UPDATE_WHILE_WORKER_ACTIVE"; exit 2
fi
git fetch origin main
git merge --ff-only origin/main
npm install --ignore-scripts --no-audit --no-fund
node --check worker/continuous-worker.mjs
node --check api/customer-analysis-worker.js
node --test tests/continuous-worker-safety.test.mjs tests/customer-worker-owner.test.mjs
bash deploy/install-worker-service.sh
echo "UPDATE_COMPLETE_WORKER_REMAINS_DISABLED"
