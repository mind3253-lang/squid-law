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
 location /api/ {
  proxy_pass http://127.0.0.1:3084;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_connect_timeout 5s;
  proxy_read_timeout 180s;
  proxy_send_timeout 180s;
 }
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
echo INTEGRATION_PROBE_BEGIN
for path in /api/customer-auth /api/skynet-profile /api/customer-cases /api/skynet-document; do
 status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "http://127.0.0.1:3084$path" || true)
 echo "INTERNAL_API:$path:$status"
done
sudo -n systemctl is-active --quiet postgresql || echo POSTGRES_AGGREGATE_UNIT_NOT_ACTIVE
for port in 5432 5433; do
 if sudo -n pg_isready -h 127.0.0.1 -p "$port" >/dev/null 2>&1; then echo "POSTGRES_READY:$port"; else echo "POSTGRES_NOT_READY:$port"; fi
done
echo INTEGRATION_PROBE_END

echo GABIA_NODE_TESTS_BEGIN
set +e
node --test tests/gabia-*.test.mjs > /tmp/gabia-e2e-node-tests.log 2>&1
test_rc=$?
set -e
grep -E '^# (tests|pass|fail|cancelled|skipped|duration_ms) ' /tmp/gabia-e2e-node-tests.log || true
if [ "$test_rc" -ne 0 ]; then
 echo GABIA_NODE_TESTS_FAILURE_DETAILS
 grep -A 16 -B 3 '^not ok' /tmp/gabia-e2e-node-tests.log | head -220 || true
fi
echo "GABIA_NODE_TESTS_EXIT:$test_rc"
echo GABIA_NODE_TESTS_END

echo FIVE_CATEGORY_E2E_BEGIN
for spec in 'AUTH:tests/gabia-auth-stage3.test.mjs' 'STORAGE:tests/gabia-storage-consumer-e2e.test.mjs' 'QUEUE:tests/customer-queue-recovery.test.mjs' 'SKYNET_UI:tests/skynet-chat-ui-recovery.test.mjs' 'REPORT:tests/analysis-report-integration.test.mjs'; do
 category="${spec%%:*}"
 testfile="${spec#*:}"
 set +e
 node --test "$testfile" > "/tmp/gabia-e2e-${category}.log" 2>&1
 rc=$?
 set -e
 echo "CATEGORY:${category}:EXIT:${rc}"
 grep -E '^# (tests|pass|fail|cancelled|skipped) ' "/tmp/gabia-e2e-${category}.log" | sed "s/^/CATEGORY:${category}:/" || true
 if [ "$rc" -ne 0 ]; then grep -A 15 -B 2 '^not ok' "/tmp/gabia-e2e-${category}.log" | head -100 || true; fi
done
echo FIVE_CATEGORY_E2E_END

echo FOUR_WORKSTREAM_READINESS_BEGIN
echo WORKSTREAM_1_AUTODEPLOY:$(sudo -n systemctl is-active squidlaw-web.service)
echo WORKSTREAM_2_PREVIEW_LOCAL:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/admin/skynet.html)
echo WORKSTREAM_3_DNS_CUTOVER:NOT_AUTHORIZED
echo WORKSTREAM_4_LEGACY_DELETION:NOT_AUTHORIZED
echo GABIA_SERVICE_HEALTH_BEGIN
for service in squidlaw-web.service squidlaw-api.service nginx.service; do
 echo "SERVICE:$service:$(sudo -n systemctl is-active "$service" || true)"
done
echo GABIA_SERVICE_HEALTH_END
echo FOUR_WORKSTREAM_READINESS_END

echo PUBLIC_PORT_80_DIAGNOSTICS_BEGIN
sudo -n nginx -T 2>&1 | grep -E 'listen |server_name |conf.d/|sites-enabled/' | head -75 || true
echo PUBLIC_PORT_80_DIAGNOSTICS_END

echo PUBLIC_HTTP_PREVIEW_PORT80_BEGIN
sudo -n tee /etc/nginx/conf.d/squidlaw-preview-public.conf >/dev/null <<'NGINX_PUBLIC'
server {
 listen 0.0.0.0:80;
 server_name 1.201.111.35 squidlaw.co.kr www.squidlaw.co.kr;
 server_tokens off;
 client_max_body_size 100m;
 add_header X-Content-Type-Options nosniff always;
 location /api/ {
  proxy_pass http://127.0.0.1:3084;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_connect_timeout 5s;
  proxy_read_timeout 180s;
  proxy_send_timeout 180s;
 }
 location / {
  proxy_pass http://127.0.0.1:3082;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_connect_timeout 5s;
  proxy_read_timeout 30s;
 }
}
NGINX_PUBLIC
sudo -n nginx -t
sudo -n systemctl reload nginx
curl -fsS -H 'Host: 1.201.111.35' -o /dev/null -w 'PUBLIC_HTTP_PREVIEW_LOCAL:%{http_code}\\n' http://127.0.0.1/
echo PUBLIC_HTTP_PREVIEW_PORT80_END

echo PUBLIC_API_AUTH_SMOKE_BEGIN
for endpoint in /api/customer-auth /api/customer-cases /api/skynet-profile /api/skynet-document; do
 code=$(curl --connect-timeout 3 --max-time 12 -s -o /dev/null -w '%{http_code}' -H 'Host: 1.201.111.35' "http://127.0.0.1$endpoint" || true)
 echo "PUBLIC_API:$endpoint:$code"
done
echo PUBLIC_API_AUTH_SMOKE_END

echo AUTH_AND_STORAGE_READINESS_BEGIN
if sudo -n test -f /etc/squidlaw/api.env; then
 for key in SQUID_AUTH_SECRET DATABASE_URL NEON_DATABASE_URL SQUIDLAW_OBJECT_BACKEND; do
  if sudo -n grep -q "^${key}=" /etc/squidlaw/api.env; then echo "CONFIG:${key}:PRESENT"; else echo "CONFIG:${key}:MISSING"; fi
 done
else echo API_ENV_MISSING; fi
for endpoint in /api/customer-auth /api/customer-cases /api/skynet-profile; do
 code=$(curl --connect-timeout 3 --max-time 10 -s -o /dev/null -w '%{http_code}' -H 'Host: 1.201.111.35' "http://127.0.0.1$endpoint" || true)
 echo "AUTH_BOUNDARY:$endpoint:$code"
done
echo AUTH_AND_STORAGE_READINESS_END

echo LOCAL_DATABASE_BINDING_BEGIN
sudo -n install -d -m 0700 /etc/squidlaw
if ! sudo -n grep -q '^SQUID_CUSTOMER_DATABASE_URL=' /etc/squidlaw/api.env; then
 if sudo -n -u postgres psql -p 5432 -Atqc "SELECT 1 FROM pg_roles WHERE rolname='squidlaw'" | grep -qx 1; then
  echo LOCAL_DB_ROLE_AVAILABLE
 else echo LOCAL_DB_ROLE_NOT_CONFIGURED; fi
fi
if sudo -n grep -q '^SQUID_CUSTOMER_DATABASE_URL=' /etc/squidlaw/api.env; then echo LOCAL_DB_URL_ALREADY_CONFIGURED; else echo LOCAL_DB_URL_PENDING; fi
if sudo -n grep -q '^SQUID_CUSTOMER_DATABASE_SSL=disable' /etc/squidlaw/api.env; then echo LOCAL_DB_SSL_CONFIGURED; else echo LOCAL_DB_SSL_PENDING; fi
echo LOCAL_DATABASE_BINDING_END

echo DOMAIN_ROUTING_CHECK_BEGIN
for domain in squidlaw.co.kr www.squidlaw.co.kr; do
 echo "DOMAIN_IP:$domain:$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u | paste -sd, -)"
 echo "DOMAIN_HTTP:$domain:$(curl -s -o /dev/null -w '%{http_code}' --resolve "$domain:80:127.0.0.1" "http://$domain/")"
done
echo DOMAIN_ROUTING_CHECK_END
