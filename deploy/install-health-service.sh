#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
node --check server/health-server.mjs
install -m 0644 deploy/squidlaw-health.service /etc/systemd/system/squidlaw-health.service
systemctl daemon-reload
systemctl enable --now squidlaw-health.service
systemctl is-active --quiet squidlaw-health.service
node deploy/inspect-gabia-health.mjs
echo "LOCAL_HEALTH_SERVICE_READY; ANALYSIS_WORKER_UNCHANGED"
