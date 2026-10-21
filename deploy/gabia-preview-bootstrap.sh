#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
node --check server/gabia-static-web.mjs
sudo -n install -m 0644 deploy/squidlaw-web.service /etc/systemd/system/squidlaw-web.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now squidlaw-web.service
sudo -n systemctl restart squidlaw-web.service
sudo -n systemctl is-active --quiet squidlaw-web.service
curl -fsS -o /dev/null -w 'LOCAL_WEB_HTTP:%{http_code}\n' http://127.0.0.1:3082/
echo WEB_PREVIEW_LOOPBACK_READY
