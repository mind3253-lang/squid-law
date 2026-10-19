#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
test -f worker/continuous-worker.mjs
node --check worker/continuous-worker.mjs
node --check api/customer-analysis-worker.js
install -m 0644 deploy/squidlaw-worker.service /etc/systemd/system/squidlaw-worker.service
systemctl daemon-reload
echo "SERVICE_FILE_INSTALLED; worker has NOT been started or enabled."
systemctl is-active squidlaw-worker.service || true
systemctl is-enabled squidlaw-worker.service || true
