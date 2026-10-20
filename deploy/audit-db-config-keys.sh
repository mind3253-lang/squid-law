#!/usr/bin/env bash
# Audit DB-related environment variable names only; never print values.
set -euo pipefail
echo DATABASE_CONFIGURATION_AUDIT_BEGIN
for file in /etc/squidlaw/api.env /etc/squidlaw/worker.env /etc/squidlaw/database.env /etc/squidlaw/migration.env; do
 if sudo -n test -f "$file"; then
  echo "FILE:$file:PRESENT"
  sudo -n awk -F= '/^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z_0-9]*=/ {k=$1;sub(/^[[:space:]]*export[[:space:]]+/,"",k);gsub(/[[:space:]]/,"",k);if(k ~ /(DATABASE|POSTGRES|PGHOST|PGPORT|PGUSER|PGDATABASE|NEON|SQL)/)print "DB_KEY:" k ":PRESENT"}' "$file"
 else echo "FILE:$file:ABSENT";fi
done
echo "POSTGRES_VERSION:$(psql --version)"
echo "POSTGRES_CLUSTER_STATUS"
pg_lsclusters
echo DATABASE_CONFIGURATION_AUDIT_END_NO_SECRET_VALUES
