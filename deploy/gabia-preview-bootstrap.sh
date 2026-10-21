#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
node --check server/gabia-static-web.mjs
sudo -n install -m 0644 deploy/squidlaw-web.service /etc/systemd/system/squidlaw-web.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now squidlaw-web.service
sudo -n systemctl restart squidlaw-web.service
sudo -n systemctl is-active --quiet squidlaw-web.service
sleep 3
if ! curl -fsS -o /dev/null -w 'LOCAL_WEB_HTTP:%{http_code}\\n' http://127.0.0.1:3082/; then
 echo WEB_START_DIAGNOSTICS_BEGIN
 sudo -n systemctl status squidlaw-web.service --no-pager -l || true
 sudo -n journalctl -u squidlaw-web.service -n 60 --no-pager || true
 echo WEB_START_DIAGNOSTICS_END
 exit 1
fi
echo WEB_PREVIEW_LOOPBACK_READY
echo SERVER_NETWORK_DIAGNOSTICS_BEGIN
sudo -n ss -lntp | head -40 || true
if command -v nginx >/dev/null 2>&1; then sudo -n nginx -t || true; else echo NGINX_NOT_INSTALLED; fi
if command -v ufw >/dev/null 2>&1; then sudo -n ufw status || true; fi
echo SERVER_NETWORK_DIAGNOSTICS_END
