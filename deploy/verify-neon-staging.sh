#!/usr/bin/env bash
set -euo pipefail
psql18=/usr/lib/postgresql/18/bin/psql
base=/var/lib/squidlaw/db-migration
db=squidlaw_stage_20261021032706
dump=$(find "$base" -maxdepth 1 -name 'neon-*.dump' -type f -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
test -n "$dump" && test -s "$dump"
echo "BACKUP_ARCHIVE_BYTES:$(stat -c %s "$dump")"
sha256sum "$dump" | awk '{print "BACKUP_ARCHIVE_SHA256:" $1}'
sudo -n -u postgres "$psql18" -p 5433 -X -v ON_ERROR_STOP=1 -At -d "$db" <<'SQL'
SELECT 'STAGING_DB:'||current_database();
SELECT 'STAGING_PG_VERSION:'||current_setting('server_version');
SELECT 'SCHEMA_TABLE_COUNTS:'||schemaname||':'||count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') GROUP BY schemaname ORDER BY schemaname;
SELECT 'TABLE_ROWS:'||schemaname||'.'||relname||':'||n_live_tup FROM pg_stat_user_tables ORDER BY schemaname,relname;
SELECT 'INVALID_INDEXES:'||count(*) FROM pg_index WHERE NOT indisvalid;
SELECT 'UNVALIDATED_CONSTRAINTS:'||count(*) FROM pg_constraint WHERE NOT convalidated;
SELECT 'STAGING_VERIFIED_SQL_OK';
SQL
