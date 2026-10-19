#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
bash -n deploy/gabia-auto-update.sh
install -m 0644 deploy/squidlaw-auto-update.service /etc/systemd/system/
install -m 0644 deploy/squidlaw-auto-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now squidlaw-auto-update.timer
systemctl is-active --quiet squidlaw-auto-update.timer
echo "AUTO_UPDATE_TIMER_ENABLED; CUSTOMER_SERVICE_UNCHANGED; WORKER_UNCHANGED"
