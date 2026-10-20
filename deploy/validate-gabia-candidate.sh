#!/usr/bin/env bash
# Validate a candidate revision in a detached staging worktree before changing live code.
set -euo pipefail
cd /opt/squidlaw/app
target="${1:?TARGET_COMMIT_REQUIRED}"
git cat-file -e "${target}^{commit}"
stage="$(mktemp -d /opt/squidlaw/.candidate.XXXXXXXX)"
cleanup(){ git worktree remove --force "$stage" >/dev/null 2>&1 || true; rm -rf "$stage"; }
trap cleanup EXIT
git worktree add --detach "$stage" "$target" >/dev/null
cd "$stage"
npm ci --ignore-scripts --no-audit --no-fund
for f in worker/continuous-worker.mjs api/customer-analysis-worker.js lib/analysis-timing.mjs lib/vision-page-validation.mjs lib/openai-vision-provider.mjs server/health-server.mjs lib/customer-pdf-visual-range.mjs lib/deployment-events.mjs server/diagnostics-auth.mjs deploy/inspect-gabia-health.mjs server/customer-web.mjs server/gabia-customer-api.mjs; do node --check "$f"; done
node --test tests/continuous-worker-safety.test.mjs tests/customer-worker-owner.test.mjs tests/worker-cutover-script.test.mjs tests/inspect-worker-config.test.mjs tests/health-server-structure.test.mjs tests/analysis-timing.test.mjs tests/customer-worker-timing-wiring.test.mjs tests/worker-cycle-timing.test.mjs tests/vision-page-validation.test.mjs tests/openai-vision-provider.test.mjs tests/vision-failure-resume-policy.test.mjs tests/gabia-auth-stage3.test.mjs tests/gabia-pdf-stage4.test.mjs tests/vision-failure-policy-stage5.test.mjs tests/skynet-stage8.test.mjs tests/gabia-billing-stage9.test.mjs tests/gabia-ops-stage10.test.mjs tests/gabia-e2e-stage11.test.mjs tests/gabia-cutover-stage12.test.mjs tests/gabia-queue-stage6.test.mjs tests/vision-provider-triage.test.mjs tests/gabia-job-ownership.test.mjs tests/gabia-document-ownership.test.mjs tests/gabia-job-pipeline.test.mjs
echo "CANDIDATE_VALIDATED=$target"
