#!/usr/bin/env bash
# Provision PostgreSQL on Gabia only. No remote Neon access, imports, DNS or app cutover.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo ROOT_REQUIRED; exit 2; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends postgresql postgresql-client
command -v psql
command -v pg_dump
command -v pg_restore
systemctl enable --now postgresql
# Ubuntu's postgresql umbrella unit can be active even without an online cluster.
pg_lsclusters
if ! pg_lsclusters --no-header | awk '$4=="online" {found=1} END{exit !found}'; then
 echo POSTGRES_NO_ONLINE_CLUSTER; exit 3
fi
# Explicitly reject externally exposed PostgreSQL listener.
if ss -lnt | grep -E '(^|[[:space:]])(0\.0\.0\.0|\[::\]):5432[[:space:]]' ; then
 echo POSTGRES_PUBLIC_LISTENER_REFUSED; exit 4
fi
install -d -m 0700 /etc/squidlaw
echo 'POSTGRES_LOCAL_INSTALL_OK_NO_NEON_OR_APP_CHANGES'
