#!/usr/bin/env bash
# Isolated Neon -> PostgreSQL 18 staging restore; never modifies Neon or port 5432.
set -euo pipefail
umask 077
: "${NEON_DATABASE_URL:?NEON_DATABASE_URL is required}"
export PGCONNECT_TIMEOUT=15
export PGSSLMODE=require
pgdump=/usr/lib/postgresql/18/bin/pg_dump
pgrestore=/usr/lib/postgresql/18/bin/pg_restore
psql18=/usr/lib/postgresql/18/bin/psql
test -x "$pgdump" && test -x "$pgrestore" && test -x "$psql18"
sudo -n -u postgres "$psql18" -p 5433 -X -At -c 'SELECT current_setting('\''server_version'\'')' | grep -q '^18\.'
base=/var/lib/squidlaw/db-migration
install -d -m 0700 "$base"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$base/neon-$stamp.dump"
db="squidlaw_stage_$(date -u +%Y%m%d%H%M%S)"
echo NEON_DUMP_BEGIN
# URI stays in environment, not process arguments or printed output.
PGDATABASE="$NEON_DATABASE_URL" "$pgdump" --format=custom --no-owner --no-acl --file="$dump"
sha256sum "$dump" | awk '{print "DUMP_SHA256:" $1}'
echo "DUMP_BYTES:$(stat -c %s "$dump")"
echo NEON_DUMP_COMPLETE
sudo -n -u postgres /usr/lib/postgresql/18/bin/createdb -p 5433 "$db"
echo "STAGING_DATABASE_CREATED:$db"
# Feed dump over stdin so postgres need not read private backup directory.
if ! sudo -n -u postgres "$pgrestore" -p 5433 --no-owner --no-acl --exit-on-error --dbname="$db" < "$dump"; then
 echo STAGING_RESTORE_FAILED_DATABASE_RETAINED_FOR_INSPECTION
 exit 1
fi
echo "STAGING_RESTORE_COMPLETE:$db"
sudo -n -u postgres "$psql18" -p 5433 -X -At -d "$db" -c "SELECT 'STAGING_USER_TABLES:'||count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');"
echo NEON_SOURCE_UNCHANGED_NO_RUNTIME_CUTOVER
