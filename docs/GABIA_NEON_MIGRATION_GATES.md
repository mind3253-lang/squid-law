# Gabia / Neon database migration: gated checklist

## Verified
- Vercel Blob copy and SHA256 verification: 1807/1807, 219232284 bytes.
- Gabia PostgreSQL 16.15 online; web/API loopback HTTP 200.
- Automatic push-triggered source synchronization and status reporting verified.
- Existing production remains on Vercel/Neon. No database cutover authorized.

## Application database connection
The customer analysis lease and job modules read SQUID_CUSTOMER_DATABASE_URL
(fallback SQUID_CUSTOMER_DATABASE_DATABASE_URL). TLS verification is enabled by default.
Database credentials must never be committed, printed in Actions logs, or pasted in chat.

## Migration prerequisites (not yet verified)
1. Obtain Neon *direct* (not pooled) connection URI from its secure owner-side configuration.
2. Store URI as an encrypted GitHub Actions secret, not as a repository file.
3. Test remote read-only connectivity without exposing the URI.
4. Confirm source PostgreSQL version, extensions, schemas, table counts, and database size.
5. Create a timestamped custom-format pg_dump with restrictive permissions and SHA256.
6. Restore to a NEW local database, never overwrite the Neon source or existing local DB.
7. Compare schema and per-table counts; test application in isolated staging mode.
8. Schedule final synchronization and cutover only with explicit owner approval.

## Safety boundaries
- Never restart the customer worker against an incomplete or unverified DB.
- Never enable public 5432, alter DNS, or disable Neon during preparation.
- Keep separate audit, backup, restore, validation, and cutover operations.
- Log only status, object counts, byte counts, checksums and redacted diagnostics.
- Treat automatic GitHub source sync as distinct from runtime deployment.
