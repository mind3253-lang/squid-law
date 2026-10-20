#!/usr/bin/env bash
set -euo pipefail
cd /opt/squidlaw/app
if systemctl is-active --quiet squidlaw-worker.service; then
 echo "REFUSING_UPDATE_WHILE_WORKER_ACTIVE"; exit 2
fi
git fetch origin main
target="$(git rev-parse origin/main)"
if ! git merge-base --is-ancestor HEAD "$target"; then echo 'NON_FAST_FORWARD_UPDATE_REFUSED'; exit 3; fi
# First deployment may not yet contain the candidate validator in the live checkout.
# Read it from the fetched commit, validate that exact candidate, then merge.
validator="$(mktemp)"
trap 'rm -f "$validator"' EXIT
git show "$target:deploy/validate-gabia-candidate.sh" > "$validator"
bash "$validator" "$target"
git merge --ff-only "$target"
# Use reproducible locked dependencies once the generated lockfile lands.
# Fail closed if the lockfile is missing; never resolve floating packages on production.
if [ ! -f package-lock.json ]; then
 echo 'PACKAGE_LOCK_REQUIRED'; exit 4
fi
npm ci --ignore-scripts --no-audit --no-fund
node --check worker/continuous-worker.mjs
node --check api/customer-analysis-worker.js
node --check lib/analysis-timing.mjs
node --check lib/vision-page-validation.mjs
node --check lib/openai-vision-provider.mjs
node --check server/health-server.mjs
node --check lib/customer-pdf-visual-range.mjs
node --check lib/deployment-events.mjs
node --check server/diagnostics-auth.mjs
node --check deploy/inspect-gabia-health.mjs
node --test tests/continuous-worker-safety.test.mjs tests/customer-worker-owner.test.mjs tests/worker-cutover-script.test.mjs tests/inspect-worker-config.test.mjs tests/health-server-structure.test.mjs tests/analysis-timing.test.mjs tests/customer-worker-timing-wiring.test.mjs tests/worker-cycle-timing.test.mjs tests/vision-page-validation.test.mjs tests/openai-vision-provider.test.mjs
bash deploy/install-worker-service.sh
bash deploy/install-health-service.sh
bash deploy/verify-gabia-update.sh
echo "UPDATE_COMPLETE_WORKER_REMAINS_DISABLED"
