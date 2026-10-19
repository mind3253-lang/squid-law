#!/usr/bin/env bash
set -euo pipefail
echo "service-active: $(systemctl is-active squidlaw-worker.service || true)"
echo "service-enabled: $(systemctl is-enabled squidlaw-worker.service || true)"
echo "installed-revision: $(git -C /opt/squidlaw/app rev-parse --short HEAD)"
if [ -f /etc/squidlaw/worker.env ]; then
  echo "env-file: present"
  stat -c 'env-mode: %a' /etc/squidlaw/worker.env
else
  echo "env-file: absent"
fi
echo "recent-service-logs:"
journalctl -u squidlaw-worker.service --no-pager -n 12 -o cat || true
