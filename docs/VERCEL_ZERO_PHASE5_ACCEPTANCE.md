# Phase 5: E2E, reliability, security and Vercel retirement
## 13 End-to-end
- Run login, case creation, file upload, analysis, recall, download and admin workflows on isolated Gabia staging, using synthetic accounts only.
- Confirm no Vercel API calls in browser network trace and all API routes respond as expected.
- Confirm Blob inventory and per-object checksum comparison is complete.
## 14 Performance, recovery, security
- Test simultaneous website users and FIFO customer analysis queue separately; preserve lease/fencing and retries.
- Test 338-page analysis against agreed target, report elapsed time and provider usage.
- Verify backup and restore for PostgreSQL and object files; validate file permissions, secrets, logs, TLS and rollback.
## 15 Vercel shutdown — STOP gate
- Never delete Vercel project or revoke Blob tokens until the live Gabia website, login, API, worker and DB pass acceptance tests.
- Verify domain and TLS cutover with rollback option, then observe error rates and jobs.
- Only after explicit owner approval, disable old Vercel cron and revoke legacy credentials.
## Current status
- Checklist and offline tests only. Actual E2E, stress, recovery and security tests have NOT been executed.
- Vercel shutdown has NOT been performed.
