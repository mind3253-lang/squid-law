# Gabia continuous worker: controlled cutover

Current default: Vercel continues to process jobs; Gabia systemd worker remains inactive and disabled.

## Proven invariants in code
- PostgreSQL global claim advisory transaction lock, active lease check and owner/fence transitions in `api/customer-analysis-jobs-db.js`.
- A running Gabia worker suppresses *its own* follow-up Vercel dispatches, but Vercel's scheduled cron and dispatches remain enabled.
- **Do not claim Vercel is disabled** until its cron and redispatch paths have been reviewed and deliberately switched over.
- Never set either approval variable during installation. Two explicit approvals are required for worker startup; neither replaces a cutover review.
- `deploy/update-worker-code.sh` refuses to update when the service is active and runs offline startup-gate tests.

## Required before cutover
1. Verify exact deployed Vercel and GitHub revisions, environment variables, Blob permissions, database TLS connectivity and secrets without printing their values.
2. Validate the service under a non-production database/blob and explicitly budgeted test job. Never point an untested worker at the live queue.
3. Audit the cron route and all other callers of `scheduleCustomerWorker`; choose one owner for the processing lane.
4. Define the handoff point and inspect active leases / retry states; preserve existing checkpoints and customer data.
5. Agree rollback: stop/disable Gabia worker, restore Vercel dispatch path, and verify claim/retry resumes.
6. After approval, separately provision `/etc/squidlaw/worker.env` mode 0600, then manually enable/start the service and monitor.
7. No speed improvement or end-to-end correctness claim without timed measurements on the same document.

Do not commit actual secrets. Do not publish logs containing keys, connection strings, or customer content.
