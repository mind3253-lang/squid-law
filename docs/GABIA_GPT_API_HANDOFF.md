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

IMPORTANT: `deploy/update-worker-code.sh` and
`deploy/validate-gabia-candidate.sh` use `npm ci`. Verify a lockfile is
present before relying on automatic deployment; otherwise candidate validation
fails closed. The legacy `squidlaw-worker.service` is not the standalone
Gabia job runner and must not be enabled as a substitute.
