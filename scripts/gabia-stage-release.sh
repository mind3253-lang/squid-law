#!/usr/bin/env bash
# Stage release on Gabia; no service restart, no DNS edits, no live cutover.
set -euo pipefail
umask 077
BASE="${SQUIDLAW_RELEASE_ROOT:-/opt/squidlaw/releases}"
REV="${GITHUB_SHA:-}"
[[ "$REV" =~ ^[a-f0-9]{40}$ ]] || { echo 'RELEASE_SHA_REQUIRED'; exit 2; }
DEST="$BASE/$REV"
mkdir -p "$DEST"
tar --exclude=.git --exclude=node_modules -cf - . | tar -xf - -C "$DEST"
(
 cd "$DEST"
 npm install --ignore-scripts --no-audit --no-fund
 node --check worker/continuous-worker.mjs
 node --check scripts/gabia-api-staging.mjs
 node --test tests/gabia-object-storage.test.mjs tests/gabia-worker-preflight.test.mjs tests/gabia-worker-backoff.test.mjs
)
echo "GABIA_RELEASE_STAGED:$REV"
