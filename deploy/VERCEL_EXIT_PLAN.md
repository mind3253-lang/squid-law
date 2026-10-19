# SQUIDLAW: Vercel exit / Gabia migration inventory

Goal: remove Vercel from the customer analysis execution path, then evaluate full application migration. Do not mistake a 403 from the Vercel management API for proof that all production routes are down.

## Currently verified Vercel-specific paths
1. `vercel.json`: `/api/customer-analysis-worker` scheduled cron every five minutes; separate SKynet backfill cron every ten minutes.
2. `lib/customer-worker-dispatch.mjs`: calls `https://$VERCEL_URL/api/customer-analysis-worker` with `waitUntil` and `CRON_SECRET`.
3. `api/customer-analysis-jobs-db.js`: on checkpoint/retry/completion calls `scheduleCustomerWorker`; now owner-gated.
4. `api/customer-analysis-worker.js`: currently imports Vercel Blob SDK and is reused by Gabia standalone worker. This is **still a Vercel storage dependency**, even if execution moves.
5. `worker/continuous-worker.mjs`: standalone process with explicit opt-in and owner gates.
6. `api/customer-analysis-lease-db.js`: shared PostgreSQL connection. Database hosting and backup location must be verified separately.
7. `vercel.json`: many admin rewrites to Vercel serverless APIs; not part of the worker-only move.

## Exit phases
A. Read-only dependency inventory: locate all `@vercel/blob`, `@vercel/functions`, `VERCEL_URL`, cron and serverless route usage; map app entry points, DB, auth, storage, OpenAI calls, SSL, domains, rollback.
B. Implement a provider-neutral Blob/storage adapter with existing object keys and private access semantics; test against a **nonproduction** store. Do not replace the live storage backend without copying and hash-verifying every required object.
C. Implement persistent Gabia API service and reverse proxy with TLS; confirm API auth, cookies, CORS, static frontend, uploads, customer isolation and rate limits. Restrict public ports; no secrets in repo.
D. Controlled traffic switch: stop or gate Vercel job claiming, verify active leases, start approved Gabia worker, validate no duplicate claims and no lost checkpoints. Roll back by stopping Gabia and restoring Vercel routing.
E. Move website/API domain only after staged health and end-to-end checks, DNS plan, rollback and backups. Do not remove Vercel until dependencies are eliminated.

## Current blockers
- Vercel environment variable inventory returned HTTP 403 (management access scope); secret values were **not** retrieved.
- Gabia environment secrets not provisioned, worker remains off.
- Existing Blob storage and DB ownership/backup have not been validated.
- Full server-side web app and auth migration not implemented.
- No paid AI tests authorized.

**No production configuration or DNS changes are authorized by this inventory.**
