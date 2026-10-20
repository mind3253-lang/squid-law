#!/usr/bin/env bash
# Explicit offline Neon -> local PostgreSQL transfer. NEVER delete the source.
# Usage: sudo NEON_DATABASE_URL=... LOCAL_DATABASE_URL=... bash deploy/gabia-postgres-migrate.sh
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo ROOT_REQUIRED; exit 2; fi
for bin in pg_dump pg_restore psql sha256sum; do command -v "$bin" >/dev/null || { echo "MISSING_$bin"; exit 3; }; done
: "${NEON_DATABASE_URL:?NEON_DATABASE_URL_REQUIRED}"
: "${LOCAL_DATABASE_URL:?LOCAL_DATABASE_URL_REQUIRED}"
case "$LOCAL_DATABASE_URL" in *localhost*|*127.0.0.1*|*%2Fvar%2Frun%2Fpostgresql*) ;; *) echo LOCAL_DATABASE_URL_MUST_BE_LOCAL; exit 4;; esac
umask 077
install -d -m 0700 /var/backups/squidlaw
backup="/var/backups/squidlaw/neon-$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "STARTING_NEON_EXPORT"
pg_dump --format=custom --no-owner --no-acl --file="$backup" "$NEON_DATABASE_URL"
sha256sum "$backup" > "$backup.sha256"
echo "EXPORT_COMPLETE_BACKUP=$backup"
# Refuse to restore into a populated destination, avoiding accidental overwrites.
count="$(psql "$LOCAL_DATABASE_URL" -X -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")"
if [ "$count" != "0" ]; then echo "DESTINATION_NOT_EMPTY_RESTORE_REFUSED"; exit 5; fi
echo "RESTORING_LOCAL_DATABASE"
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$LOCAL_DATABASE_URL" "$backup"
echo "LOCAL_RESTORE_COMPLETE_SOURCE_UNCHANGED"
echo "NEXT_CHECK_DB_CONNECTIONS_AND_APPLICATION_BEFORE_CUTOVER"
