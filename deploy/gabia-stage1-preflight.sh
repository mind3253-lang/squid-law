#!/usr/bin/env bash
# Read-only Gabia migration readiness inventory. Does not print secrets.
set -euo pipefail
echo 'GABIA_STAGE1_PREFLIGHT'
for binary in node npm git nginx openssl systemctl docker psql pg_dump curl; do
 if command -v "$binary" >/dev/null 2>&1; then
   echo "$binary=present"
 else
   echo "$binary=missing"
 fi
done
if command -v node >/dev/null 2>&1; then node --version; fi
if command -v nginx >/dev/null 2>&1; then nginx -t 2>&1 | tail -n 2 || true; fi
for service in squidlaw-worker.service squidlaw-health.service squidlaw-auto-update.timer; do
 state="$(systemctl is-active "$service" 2>/dev/null || true)"
 enabled="$(systemctl is-enabled "$service" 2>/dev/null || true)"
 echo "$service active=$state enabled=$enabled"
done
for path in /opt/squidlaw/app /etc/squidlaw/worker.env /var/lib/squidlaw /var/lib/squidlaw/objects; do
 if test -e "$path"; then echo "$path=present"; else echo "$path=missing"; fi
done
echo 'DISK'
df -h /
echo 'OBJECT_ROOT'
if test -d /var/lib/squidlaw/objects; then
 du -sh /var/lib/squidlaw/objects 2>/dev/null || echo 'object_root=not_readable'
else
 echo 'object_root=not_created'
fi
echo 'dns=NOT_CHANGED https=NOT_ACTIVATED customer_web=NOT_ACTIVATED'
