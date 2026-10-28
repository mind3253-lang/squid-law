#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/lock/squidlaw-auto-update.lock
flock -n 9 || exit 0
cd /opt/squidlaw/app
status_file=/var/lib/squidlaw/auto-update-status.json
record_status() {
 local outcome="$1" revision
 revision="$(git rev-parse HEAD 2>/dev/null || true)"
 mkdir -p /var/lib/squidlaw
 STATUS_OUTCOME="$outcome" STATUS_REVISION="$revision" node -e '
 const fs=require("node:fs");
 fs.writeFileSync(process.argv[1],JSON.stringify({
  outcome:process.env.STATUS_OUTCOME,revision:process.env.STATUS_REVISION,
  recordedAt:new Date().toISOString()
 })+String.fromCharCode(10),{mode:0o600});
 ' "$status_file"
 STATUS_OUTCOME="$outcome" STATUS_REVISION="$revision" node --input-type=module -e '
  import {recordDeploymentEvent} from "./lib/deployment-events.mjs";
  await recordDeploymentEvent({outcome:process.env.STATUS_OUTCOME,revision:process.env.STATUS_REVISION});
 '
}
# The old five-minute Git merge/install path is retired.
# Production code is updated only by gabia-code-deploy.yml.
record_status canonical_deploy_only
echo "AUTO_UPDATE_DISABLED_CANONICAL_DEPLOY_ONLY"
