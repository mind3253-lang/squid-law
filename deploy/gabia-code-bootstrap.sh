#!/usr/bin/env bash
# First-time source-only bootstrap on Gabia Ubuntu. No customer data, secrets, DNS, or live service changes.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "ROOT_REQUIRED"; exit 2; fi
APP_ROOT=/opt/squidlaw/app
REPO_URL=https://github.com/mind3253-lang/squid-law.git
install -d -m 0755 /opt/squidlaw /var/lib/squidlaw
if [ -e "$APP_ROOT" ] && [ ! -d "$APP_ROOT/.git" ]; then
 echo "REFUSING_TO_OVERWRITE_NON_GIT_APP"; exit 3
fi
if [ ! -d "$APP_ROOT/.git" ]; then
 command -v git >/dev/null || { echo "GIT_REQUIRED"; exit 4; }
 git clone --filter=blob:none --single-branch --branch main "$REPO_URL" "$APP_ROOT"
else
 git -C "$APP_ROOT" diff --quiet && git -C "$APP_ROOT" diff --cached --quiet || { echo "LOCAL_CHANGES_REFUSED"; exit 5; }
 git -C "$APP_ROOT" fetch origin main
 current="$(git -C "$APP_ROOT" rev-parse HEAD)"
 target="$(git -C "$APP_ROOT" rev-parse origin/main)"
 git -C "$APP_ROOT" merge-base --is-ancestor "$current" "$target" || { echo "NON_FAST_FORWARD_REFUSED"; exit 6; }
 git -C "$APP_ROOT" merge --ff-only "$target"
fi
echo "SOURCE_READY_REVISION=$(git -C "$APP_ROOT" rev-parse HEAD)"
if command -v node >/dev/null 2>&1; then
 for file in server/customer-web.mjs server/gabia-customer-api.mjs worker/continuous-worker.mjs api/customer-analysis-worker.js; do
  if [ -f "$APP_ROOT/$file" ]; then node --check "$APP_ROOT/$file"; fi
 done
else
 echo "NODE_MISSING_SOURCE_ONLY"
fi
if [ -f "$APP_ROOT/package-lock.json" ] && command -v npm >/dev/null 2>&1; then
 (cd "$APP_ROOT" && npm ci --ignore-scripts --no-audit --no-fund)
else
 echo "DEPENDENCIES_NOT_INSTALLED_REQUIRE_NPM_AND_LOCKFILE"
fi
echo "BOOTSTRAP_COMPLETE_SERVICES_NOT_STARTED_DNS_UNCHANGED"
