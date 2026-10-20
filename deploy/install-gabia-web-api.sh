#!/usr/bin/env bash
# Install standalone Gabia web and API services; do not change DNS or enable nginx.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo ROOT_REQUIRED; exit 2; fi
cd /opt/squidlaw/app
command -v node >/dev/null
node --check server/gabia-static-web.mjs
node --check server/gabia-api-compat.mjs
install -d -m 0700 /etc/squidlaw
install -d -m 0700 /var/lib/squidlaw/objects
if [ ! -e /etc/squidlaw/api.env ]; then
 install -m 0600 /dev/null /etc/squidlaw/api.env
 echo API_ENV_CREATED_EMPTY
else
 chmod 0600 /etc/squidlaw/api.env
fi
install -m 0644 deploy/squidlaw-web.service /etc/systemd/system/squidlaw-web.service
install -m 0644 deploy/squidlaw-api.service /etc/systemd/system/squidlaw-api.service
systemctl daemon-reload
systemctl enable --now squidlaw-web.service
systemctl is-active --quiet squidlaw-web.service
echo WEB_ACTIVE_LOOPBACK_ONLY
if ! grep -Eq '^SQUID_AUTH_SECRET=.{32,}' /etc/squidlaw/api.env; then
 echo API_NOT_STARTED_MISSING_AUTH_SECRETS
 exit 0
fi
systemctl enable --now squidlaw-api.service
systemctl is-active --quiet squidlaw-api.service
echo API_ACTIVE_LOOPBACK_ONLY
