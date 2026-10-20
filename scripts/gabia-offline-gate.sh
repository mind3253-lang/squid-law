#!/usr/bin/env bash
# Read-only deployment gate: checks syntax and offline tests without touching production.
set -euo pipefail
node --check scripts/gabia-blob-migrate.mjs
node --check api/skynet-chat.js
node --check api/skynet-recall-batch.js
node --check api/auth/naver/callback.js
node --check scripts/gabia-api-staging.mjs
node --check worker/continuous-worker.mjs
node --check lib/customer-object-storage.mjs
node --check lib/gabia-private-objects.mjs
node --test tests/gabia-object-storage.test.mjs tests/gabia-worker-preflight.test.mjs tests/gabia-worker-backoff.test.mjs tests/gabia-phase5-safety.test.mjs tests/gabia-skynet-storage-integration.test.mjs tests/gabia-staging-gateway.test.mjs tests/gabia-static-security.test.mjs tests/gabia-storage-consumer-e2e.test.mjs
echo 'GABIA_OFFLINE_GATE_PASSED'
