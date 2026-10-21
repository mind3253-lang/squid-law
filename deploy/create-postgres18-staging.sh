#!/usr/bin/env bash
# Safe and idempotent staging-only PostgreSQL 18 cluster at loopback port 5433.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo ROOT_REQUIRED; exit 1; fi
test -x /usr/lib/postgresql/18/bin/postgres || { echo POSTGRES_18_NOT_INSTALLED; exit 1; }
if pg_lsclusters -h | awk '$1=="18" && $2=="squidlawstage" {found=1} END{exit !found}'; then
 echo STAGING_CLUSTER_ALREADY_EXISTS
else
 pg_createcluster 18 squidlawstage --port 5433 --start-conf manual -- --auth-local=peer --auth-host=scram-sha-256
 echo STAGING_CLUSTER_CREATED
fi
conf=/etc/postgresql/18/squidlawstage/postgresql.conf
sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = '127.0.0.1'/" "$conf"
grep -q "^listen_addresses = '127.0.0.1'" "$conf" || printf "\nlisten_addresses = '127.0.0.1'\n" >>"$conf"
pg_ctlcluster 18 squidlawstage start || { pg_lsclusters; exit 1; }
pg_lsclusters
sudo -n -u postgres /usr/lib/postgresql/18/bin/psql -p 5433 -X -At -c "SELECT 'STAGING_PG_VERSION:'||current_setting('server_version');"
echo STAGING_POSTGRES_18_READY_NO_NEON_ACCESS_NO_PRODUCTION_CUTOVER
