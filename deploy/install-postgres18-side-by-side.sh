#!/usr/bin/env bash
# Installs PostgreSQL 18 side-by-side with Ubuntu PostgreSQL 16.
# Does not upgrade, remove, restart or reconfigure the existing 16 cluster.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if [ "$(id -u)" -ne 0 ]; then echo 'ROOT_REQUIRED'; exit 1; fi
. /etc/os-release
if [ "$ID" != ubuntu ] || [ "$VERSION_ID" != 24.04 ]; then echo 'UNSUPPORTED_OS'; exit 1; fi
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg
install -d -m 0755 /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg.tmp
mv /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg.tmp /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
chmod 0644 /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$VERSION_CODENAME" >/etc/apt/sources.list.d/pgdg.list
apt-get update -qq
# Prevent Debian postinst from creating or starting a default 18 cluster.
mkdir -p /etc/postgresql-common
if [ -f /etc/postgresql-common/createcluster.conf ]; then
  cp -n /etc/postgresql-common/createcluster.conf /etc/postgresql-common/createcluster.conf.pre-squidlaw-18
fi
sed -i 's/^#\?create_main_cluster *=.*/create_main_cluster = false/' /etc/postgresql-common/createcluster.conf
grep -q '^create_main_cluster' /etc/postgresql-common/createcluster.conf || printf '\ncreate_main_cluster = false\n' >>/etc/postgresql-common/createcluster.conf
apt-get install -y -qq postgresql-18 postgresql-client-18
echo 'POSTGRES_18_BINARIES_INSTALLED'
/usr/lib/postgresql/18/bin/pg_dump --version
/usr/lib/postgresql/18/bin/pg_restore --version
pg_lsclusters
echo 'POSTGRES_16_CLUSTER_UNMODIFIED_BY_SCRIPT'
echo 'NO_18_CLUSTER_CREATED_NO_DATABASE_CUTOVER'
