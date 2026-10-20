# VERCEL ZERO phase 2: code changes and cutover gate
- Storage compatibility layer `lib/customer-object-storage.mjs` selects `vercel` by default; `gabia` only when explicitly configured.
- Analysis worker imports the adapter for private object read/write/list. No customer data is moved by this commit.
- Local storage smoke test exercises write, read, list and duplicate rejection.
- PostgreSQL job-lease implementation remains unchanged, to preserve advisory locks and fencing.
- **Not production-ready:** other APIs, authentication, Blob data copy, full DB connectivity, service deployment and end-to-end verification remain pending.
- Do not enable `SQUIDLAW_OBJECT_BACKEND=gabia` until all required objects have been copied and verified.
