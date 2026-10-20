#!/usr/bin/env bash
# Read-only Gabia cutover preflight. Never starts services or changes DNS.
set -euo pipefail
cd /opt/squidlaw/app
fail=0
check(){ if "$@"; then printf 'PASS %s\n' "$*"; else printf 'FAIL %s\n' "$*"; fail=1; fi; }
for bin in node npm git psql pg_dump pg_restore nginx systemctl curl; do
 if command -v "$bin" >/dev/null 2>&1; then echo "PASS binary:$bin"; else echo "FAIL binary:$bin"; fail=1; fi
done
for f in server/gabia-static-web.mjs server/gabia-api-compat.mjs worker/continuous-worker.mjs api/customer-analysis-worker.js; do
 check node --check "$f"
done
if [ -d node_modules ]; then echo 'PASS dependencies-present'; else echo 'FAIL dependencies-missing'; fail=1; fi
for f in /etc/squidlaw/api.env /etc/squidlaw/worker.env; do
 if [ -f "$f" ]; then
  mode="$(stat -c %a "$f")"
  case "$mode" in 600|400) echo "PASS env-permissions:$f";; *) echo "FAIL env-permissions:$f"; fail=1;; esac
 else echo "WARN env-not-created:$f"; fi
done
for port in 3082 3084; do
 if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:$port/"; then echo "PASS loopback:$port"; else echo "WARN loopback-not-ready:$port"; fi
done
if command -v nginx >/dev/null 2>&1; then check nginx -t; fi
if [ "$fail" -ne 0 ]; then echo 'PREFLIGHT_FAILED_NO_CHANGES_MADE'; exit 1; fi
echo 'PREFLIGHT_STATIC_CHECKS_PASSED_RUNTIME_TESTS_STILL_REQUIRED'
