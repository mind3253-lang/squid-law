# SQUIDLAW customer PostgreSQL activation

This database is exclusively for customer analysis execution leases. Do not point it at SKYNET or an existing customer document database.

1. Provision a dedicated PostgreSQL 15+ database under the account owner.
2. Set `SQUID_CUSTOMER_DATABASE_URL` in the Vercel production environment to its authenticated connection URL, or use the Neon integration-provided `SQUID_CUSTOMER_DATABASE_DATABASE_URL` (the application accepts either). Use verified TLS; set `SQUID_CUSTOMER_DATABASE_SSL=disable` only for a trusted local test database.
3. Run `node scripts/customer-db-migrate.mjs` with that URL available in the environment. This creates/verifies `customer_analysis_leases` without dropping or altering unrelated tables.
4. Redeploy the GitHub `main` revision. Confirm the production deployment SHA and customer API behavior using authenticated test cases.

If the database URL is missing or unreachable, analysis must remain unavailable (503). Never use a mock database to authorize production analysis.

Safety: a processing lease with an unknown AI outcome cannot be retried automatically. An expired saving lease may resume only from a durable Draft. The schema migration and end-to-end recovery test require actual owner-provisioned PostgreSQL and Blob credentials; the repository CI checks alone are not proof of production readiness.
