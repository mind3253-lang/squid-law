#!/usr/bin/env bash
# Safe local preparation only: never change external routing or start a live worker.
set -euo pipefail
action="${1:-}"
unit=squidlaw-worker.service
envfile=/etc/squidlaw/worker.env
case "$action" in
 preflight)
  test "$(id -u)" -eq 0 || { echo ROOT_REQUIRED; exit 2; }
  test -f "$envfile" || { echo ENV_MISSING; exit 2; }
  test "$(stat -c %a "$envfile")" = 600 || { echo ENV_PERMISSIONS_UNSAFE; exit 2; }
  if systemctl is-active --quiet "$unit"; then echo WORKER_ALREADY_ACTIVE; exit 2; fi
  if systemctl is-enabled --quiet "$unit"; then echo WORKER_ALREADY_ENABLED; exit 2; fi
  cd /opt/squidlaw/app
  node --test tests/continuous-worker-safety.test.mjs tests/customer-worker-owner.test.mjs
  echo PREFLIGHT_LOCAL_OK_NOT_CUTOVER_APPROVED
  echo "VERIFY_ACTIVE_JOB_OWNER_ENV_AND_SCHEDULERS_BEFORE_ANY_START"
  ;;
 rollback)
  test "$(id -u)" -eq 0 || { echo ROOT_REQUIRED; exit 2; }
  systemctl stop "$unit"
  systemctl disable "$unit"
  systemctl reset-failed "$unit" || true
  echo GABIA_WORKER_STOPPED_AND_DISABLED
  echo "IMPORTANT: verify the active job owner and scheduler routing separately; this command only stops the Gabia worker."
  ;;
 status)
  echo "active: $(systemctl is-active "$unit" || true)"
  echo "enabled: $(systemctl is-enabled "$unit" || true)"
  echo "revision: $(git -C /opt/squidlaw/app rev-parse --short HEAD)"
  ;;
 *)
  echo 'Usage: bash deploy/worker-cutover.sh preflight|rollback|status'
  exit 2
  ;;
esac
