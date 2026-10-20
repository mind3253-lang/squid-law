#!/usr/bin/env bash
# Read-only migration preflight. Does not connect to Neon or change local PostgreSQL.
set -euo pipefail
echo 'NEON_PREFLIGHT_BEGIN'
for binary in psql pg_dump pg_restore pg_isready; do
 if command -v "$binary" >/dev/null 2>&1; then echo "TOOL:$binary:$(command -v "$binary")"; else echo "TOOL:$binary:MISSING"; fi
done
for config in /etc/squidlaw/database.env /etc/squidlaw/migration.env /etc/squidlaw/api.env /etc/squidlaw/worker.env; do
 if sudo -n test -s "$config"; then echo "CONFIG:$config:NONEMPTY"; elif sudo -n test -f "$config"; then echo "CONFIG:$config:EMPTY"; else echo "CONFIG:$config:ABSENT"; fi
done
for name in postgresql squidlaw-worker squidlaw-api squidlaw-web nginx; do
 echo "SERVICE:$name:$(systemctl is-active "$name" 2>/dev/null || true)"
done
if command -v pg_isready >/dev/null 2>&1; then
 pg_isready -h 127.0.0.1 -p 5432 || true
fi
echo 'NEON_PREFLIGHT_END_NO_DATA_OR_RUNTIME_CHANGES'
