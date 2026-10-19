#!/usr/bin/env bash
set -euo pipefail
install -d -m 0700 /etc/squidlaw
if [ ! -e /etc/squidlaw/worker.env ]; then
 install -m 0600 /dev/null /etc/squidlaw/worker.env
 echo 'ENV_CREATED_EMPTY_NO_APPROVAL'
else
 chmod 0600 /etc/squidlaw/worker.env
 echo 'ENV_EXISTS_NOT_OVERWRITTEN'
fi
echo 'WORKER_NOT_STARTED'
