#!/usr/bin/env bash
# Read-only deployment gate: checks syntax and offline tests without touching production.
set -euo pipefail
node --check scripts/gabia-blob-migrate.mjs
node --check scripts/gabia-api-staging.mjs
node --check worker/continuous-worker.mjs
node --check lib/customer-object-storage.mjs
node --check lib/gabia-private-objects.mjs
node --test tests/gabia-object-storage.test.mjs tests/gabia-worker-preflight.test.mjs tests/gabia-worker-backoff.test.mjs tests/gabia-phase5-safety.test.mjs
echo 'GABIA_OFFLINE_GATE_PASSED'
