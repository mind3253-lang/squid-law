# Phase 2 handoff — Vercel Zero
04 API migration: not complete; routes and authentication remain to be ported.
05 Blob migration: staging adapter and copy/verify script prepared. Copy has NOT been executed.
06 PostgreSQL: existing job queue and fencing code retained. Gabia DB connection has NOT been verified.
Migration script: `node scripts/gabia-blob-migrate.mjs` inventory-only; `node scripts/gabia-blob-migrate.mjs --copy` writes to private Gabia object root. Only run on secure host with configured credentials, after backup.
Cutover prohibited until complete Blob inventory, full copy and checksum verification, DB connectivity, API parity, and E2E pass.
