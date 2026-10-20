# Gabia GPT API handoff (no keys in GitHub)
The current GitHub auto-update timer only fetches and validates application code.
It cannot copy an OpenAI secret from Vercel to the Gabia host. The current
Gabia standalone analysis worker is opt-in and inactive.

1. Run `bash deploy/check-gabia-openai-config.sh` on the Gabia host.
   It prints variable names and paths, never secret values.
2. A server administrator must securely provision the existing valid
   `OPENAI_API_KEY` in a root-owned, mode-0600 environment file outside
   the repository. Never paste the key into chat, GitHub, commits, or logs.
3. `SQUIDLAW_GABIA_DATABASE_URL`, `SQUIDLAW_GABIA_PDF_ROOT`, and
   `SQUIDLAW_GABIA_REPORT_ROOT` must also be configured for the standalone
   worker. Confirm the actual systemd unit reads the selected environment file.
4. `SQUIDLAW_GABIA_LEGAL_RUN_APPROVED=YES` permits paid calls; do not set it
   until the actual worker, tenant case role and database are verified.
5. This does not start a worker, migrate DNS, or enable public API endpoints.

A GitHub Actions workflow generates `package-lock.json`, verifies `npm ci`,
and attempts to commit it to main. Gabia candidate validation and updates
require the lockfile and use `npm ci` to avoid resolving unpinned packages
on the production host. Until the GitHub Actions run commits the lockfile,
the auto-update correctly fails closed. Check Actions and the main branch
before claiming the lockfile has landed. The legacy `squidlaw-worker.service` is not the standalone
Gabia job runner and must not be enabled as a substitute.
