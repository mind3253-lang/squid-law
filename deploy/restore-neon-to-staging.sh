#!/usr/bin/env bash
# One-way Neon -> isolated Gabia staging DB. Never alters source or live database.
set -euo pipefail
umask 077
: "${NEON_DATABASE_URL:?NEON_DATABASE_URL missing}"
command -v pg_dump >/dev/null
command -v pg_restore >/dev/null
command -v createdb >/dev/null
command -v psql >/dev/null
base=/var/lib/squidlaw/db-migration
mkdir -p "$base"
chmod 700 "$base"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$base/neon-$stamp.dump"
db="squidlaw_stage_$(date -u +%Y%m%d%H%M%S)"
echo 'NEON_DUMP_BEGIN'
pg_dump --dbname="$NEON_DATABASE_URL" --format=custom --no-owner --no-acl --file="$dump"
sha256sum "$dump" | awk '{print "DUMP_SHA256:" $1}'
echo "DUMP_BYTES:$(stat -c %s "$dump")"
echo 'NEON_DUMP_COMPLETE'
# Local PostgreSQL access is via the postgres system user; staging only.
sudo -n -u postgres createdb "$db"
echo "STAGING_DATABASE_CREATED:$db"
if ! sudo -n -u postgres pg_restore --no-owner --no-acl --exit-on-error --dbname="$db" "$dump"; then
 echo 'STAGING_RESTORE_FAILED_DATABASE_RETAINED_FOR_INSPECTION'
 exit 1
fi
echo "STAGING_RESTORE_COMPLETE:$db"
sudo -n -u postgres psql -X -At -d "$db" -c "SELECT 'STAGING_USER_TABLES:'||count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');"
echo 'NEON_SOURCE_UNCHANGED_NO_RUNTIME_CUTOVER'
