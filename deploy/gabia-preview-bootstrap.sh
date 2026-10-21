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

echo PUBLIC_PREVIEW_BOOTSTRAP_BEGIN
if ! command -v nginx >/dev/null 2>&1; then
 sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update -qq
 sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
fi
sudo -n tee /etc/nginx/conf.d/squidlaw-preview.conf >/dev/null <<'NGINX'
server {
 listen 0.0.0.0:8088;
 server_name _;
 server_tokens off;
 client_max_body_size 100m;
 add_header X-Content-Type-Options nosniff always;
 location /api/ { return 503; }
 location / {
  proxy_pass http://127.0.0.1:3082;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_connect_timeout 5s;
  proxy_read_timeout 30s;
 }
}
NGINX
sudo -n nginx -t
sudo -n systemctl enable --now nginx
sudo -n systemctl reload nginx
curl -fsS -o /dev/null -w 'PUBLIC_PREVIEW_LOCAL_HTTP:%{http_code}\\n' http://127.0.0.1:8088/
echo PUBLIC_PREVIEW_BOOTSTRAP_OK
echo E2E_SERVER_SMOKE_BEGIN
for path in / /index.html /admin/skynet.html; do
 status=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8088$path")
 echo "PREVIEW_PATH:$path:$status"
done
api_status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3084/health || true)
echo "API_HEALTH_HTTP:$api_status"
echo E2E_SERVER_SMOKE_END
echo NONMUTATING_API_CHECK_BEGIN
for path in /api/skynet-profile /api/customer-auth /api/customer-cases /api/skynet-document; do
 status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "http://127.0.0.1:3084$path" || true)
 echo "API_ROUTE:$path:$status"
done
echo NONMUTATING_API_CHECK_END
echo STATIC_ASSET_CHECK_BEGIN
for path in /admin/skynet.html /admin/index.html /skynet.html /favicon.ico; do
 status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:8088$path" || true)
 echo "STATIC_ROUTE:$path:$status"
done
echo STATIC_ASSET_CHECK_END
