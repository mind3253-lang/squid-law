# SQUIDLAW / SKYNET single-server cutover

Status: **not executed**. GitHub commits are not proof of server installation.

## Intended target
- Ubuntu VPS: static web 127.0.0.1:3082, compatibility API 127.0.0.1:3084, PostgreSQL local, continuous worker via systemd, private objects under /var/lib/squidlaw/objects.
- Nginx serves HTTPS externally and proxies only intended routes.
- Backups must be stored **off-server** and tested with a restore.
- Preserve active customer data and verify the local PostgreSQL database and object storage before changing runtime paths.

## Execute on the actual VPS, in order
1. Confirm SSH administrative access, OS packages, Node/npm, PostgreSQL and Nginx. Ensure inbound firewall permits only intended SSH/HTTP/HTTPS ports.
2. Install app source and dependencies using deploy/gabia-code-bootstrap.sh; validate node --check for all API modules and runtime import compatibility.
3. Create a dedicated local PostgreSQL database and user, restricted to loopback. Do not paste secrets into GitHub or chat.
4. Verify the current Gabia PostgreSQL schema, table counts, and application queries. Do not overwrite active databases. Additional SKYNET/job schemas and object files require independent checks.
5. Configure /etc/squidlaw/api.env (0600), including SQUIDLAW_OBJECT_BACKEND=gabia, SQUIDLAW_OBJECT_ROOT, SQUID_AUTH_SECRET, SQUID_CUSTOMER_DATABASE_URL, SQUID_CUSTOMER_DATABASE_SSL=disable, POSTGRES_URL and SKYNET_JOB_BACKEND=postgres where supported. Supply all other required provider keys securely.
6. Install local web/API services; start worker only after DB preflight, credentials and storage paths pass. Test loopback health, login, case creation, PDF upload, analysis queue, worker completion, SKYNET document, search and admin access.
7. Configure Nginx + TLS and test HTTPS. Only then change DNS/cutover, check production and verify offsite backups.
8. Confirm the live Gabia services, customer routes, and recovery checks after deployment.

## Current known limitations
- No direct SSH execution path available from the current chat connector. Server state has **not** been verified.
- GitHub compatibility routes are not equivalent to a completed end-to-end test.
- Private object storage must be checked independently; database backups do not contain object files.
- Confirm that the active job schema matches the worker's expectations; do not overwrite it blindly.
- Confirm that all handlers and systemd env variables match before starting production.

## Read-only checkpoint
Run deploy/gabia-cutover-preflight.sh **on the VPS** after the source is installed. It checks runtime dependencies, syntax, local service reachability and Nginx configuration. It does not change DNS or start services. Its loopback checks are warnings, not proof of full API functionality. Validate both positive and negative authentication cases and worker/database persistence separately.
