#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
if systemctl is-active --quiet squidlaw-worker.service; then
 echo "ROLLBACK_REFUSED_WORKER_ACTIVE"; exit 2
fi
target="${1:-}"
if [[ ! "$target" =~ ^[a-f0-9]{40}$ ]]; then
 echo "ROLLBACK_REQUIRES_EXACT_COMMIT_SHA"; exit 2
fi
if ! git cat-file -e "$target^{commit}" 2>/dev/null; then
 echo "ROLLBACK_TARGET_NOT_FOUND"; exit 2
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
 echo "ROLLBACK_REFUSED_LOCAL_CHANGES"; exit 2
fi
current="$(git rev-parse HEAD)"
if ! git merge-base --is-ancestor "$target" "$current"; then
 echo "ROLLBACK_REFUSED_NOT_ANCESTOR"; exit 2
fi
if [ "$target" = "$current" ]; then
 echo "ROLLBACK_ALREADY_AT_TARGET"; exit 0
fi
git checkout --detach "$target"
if ! npm install --ignore-scripts --no-audit --no-fund && true; then
 echo "ROLLBACK_DEPENDENCY_INSTALL_FAILED"; exit 1
fi
node --check server/health-server.mjs
node --check api/customer-analysis-worker.js
bash deploy/install-health-service.sh
echo "ROLLBACK_CODE_CHECKOUT=$target; CUSTOMER_DATA_UNCHANGED; WORKER_UNCHANGED"
echo "AUTO_UPDATE_WILL_NOT_FAST_FORWARD_FROM_DETACHED_HEAD; OPERATOR_MUST RESTORE MAIN"
