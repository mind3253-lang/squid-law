#!/usr/bin/env bash
# Read-only, redacted Gabia GPT readiness check. Never prints credentials.
set -euo pipefail
echo "GABIA_GPT_READINESS_CHECK"
for file in /etc/squidlaw/worker.env /etc/squidlaw/gabia.env /opt/squidlaw/app/.env; do
  if [ ! -f "$file" ]; then
    echo "ENV_FILE_ABSENT=$file"
    continue
  fi
  echo "ENV_FILE_PRESENT=$file"
  if [ "$(stat -c '%a' "$file")" != 600 ]; then
    echo "ENV_FILE_PERMISSIONS_REVIEW_REQUIRED=$file"
  fi
  for key in OPENAI_API_KEY SQUIDLAW_GABIA_DATABASE_URL SQUIDLAW_GABIA_PDF_ROOT SQUIDLAW_GABIA_REPORT_ROOT SQUIDLAW_GABIA_LEGAL_RUN_APPROVED; do
    if grep -Eq "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file"; then
      echo "SETTING_DECLARED=$key"
    fi
  done
done
if systemctl is-active --quiet squidlaw-worker.service; then
 echo "LEGACY_WORKER_ACTIVE_REVIEW_REQUIRED"
else
 echo "LEGACY_WORKER_NOT_ACTIVE"
fi
echo "NO_CONNECTION_ATTEMPTED_NO_SERVICE_CHANGED"
