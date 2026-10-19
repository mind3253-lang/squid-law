#!/usr/bin/env bash
# Read-only server readiness inventory. No service starts, DNS edits or secrets output.
set -euo pipefail
echo "GABIA_STAGE1_PREFLIGHT"
for binary in node npm git nginx openssl systemctl; do
 if command -v "$binary" >/dev/null 2>&1; then echo "$binary=present"; else echo "$binary=missing"; fi
done
node --version
if command -v nginx >/dev/null 2>&1; then nginx -t 2>&1 | tail -n 2 || true; fi
for service in squidlaw-worker.service squidlaw-health.service squidlaw-auto-update.timer; do
 state="$(systemctl is-active "$service" 2>/dev/null || true)"
 enabled="$(systemctl is-enabled "$service" 2>/dev/null || true)"
 echo "$service active=$state enabled=$enabled"
done
for path in /opt/squidlaw/app /etc/squidlaw/worker.env /var/lib/squidlaw; do
 if test -e "$path"; then echo "$path=present"; else echo "$path=missing"; fi
done
echo "dns=NOT_CHANGED https=NOT_ACTIVATED customer_web=NOT_ACTIVATED"
