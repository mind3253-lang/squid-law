# Gabia continuous worker: controlled cutover

Current worker ownership and activation state must be verified on Gabia before any changes. This historical checklist does not establish current production state.

## Proven invariants in code
- PostgreSQL global claim advisory transaction lock, active lease check and owner/fence transitions in `api/customer-analysis-jobs-db.js`.
- Check all worker dispatchers, scheduled jobs, and retries for duplicate processing ownership.
- **Do not claim single-owner processing** until all active scheduler and redispatch paths have been reviewed.
- Never set either approval variable during installation. Two explicit approvals are required for worker startup; neither replaces a cutover review.
- `deploy/update-worker-code.sh` refuses to update when the service is active and runs offline startup-gate tests.

## Required before cutover
1. Verify the deployed Gabia and GitHub revisions, environment variables, storage permissions, database TLS connectivity and secrets without printing their values.
2. Validate the service under a non-production database/blob and explicitly budgeted test job. Never point an untested worker at the live queue.
3. Audit the cron route and all other callers of `scheduleCustomerWorker`; choose one owner for the processing lane.
4. Define the handoff point and inspect active leases / retry states; preserve existing checkpoints and customer data.
5. Agree rollback: stop/disable the affected worker, restore the verified job owner and verify claim/retry resumes.
6. After approval, separately provision `/etc/squidlaw/worker.env` mode 0600, then manually enable/start the service and monitor.
7. No speed improvement or end-to-end correctness claim without timed measurements on the same document.

Do not commit actual secrets. Do not publish logs containing keys, connection strings, or customer content.

## Prepared local commands (do not activate production)
- `bash deploy/worker-cutover.sh preflight`: check local permissions and offline tests only.
- `bash deploy/worker-cutover.sh status`: show local service state.
- `bash deploy/worker-cutover.sh rollback`: stop/disable Gabia worker only; verify job owner routing separately.
- Production start and scheduler ownership changes are intentionally **not** automated; inspect current live leases before any change.
