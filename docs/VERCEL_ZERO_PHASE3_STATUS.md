# VERCEL ZERO phase 3 — analysis worker preflight
- Gabia worker validates explicit cutover approval, owner, PostgreSQL, OpenAI key (when legal API enabled), and storage backend.
- Gabia storage mode no longer requires Vercel Blob token at worker startup.
- Existing Vercel storage mode still requires Blob token.
- No changes to queue lease/fencing, concurrency, or customer data.
- This is source code preparation, not proof of production readiness.
- Phase 3 remains incomplete pending real server execution, end-to-end analysis, and removal of remaining Vercel-specific imports across all code paths.
