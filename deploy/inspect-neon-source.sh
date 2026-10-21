#!/usr/bin/env bash
# Read-only PostgreSQL source inspection; never print the connection URI.
set -euo pipefail
umask 077
: "${NEON_DATABASE_URL:?NEON_DATABASE_URL secret is required}"
export PGCONNECT_TIMEOUT=12
export PGSSLMODE=verify-full
echo NEON_SOURCE_INSPECTION_BEGIN
psql "$NEON_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT 'VERSION:'||current_setting('server_version'), 'DATABASE:'||current_database(), 'SIZE_BYTES:'||pg_database_size(current_database());"
psql "$NEON_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT 'TABLE:'||schemaname||'.'||tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename;"
psql "$NEON_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT 'EXTENSION:'||extname||':'||extversion FROM pg_extension ORDER BY extname;"
echo NEON_SOURCE_INSPECTION_END_READ_ONLY
