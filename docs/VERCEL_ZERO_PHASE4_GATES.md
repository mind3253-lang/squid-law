# Phase 4 — Gabia deployment, SKYNET and TLS gates
- GitHub Actions `gabia-release-preflight.yml` is manual-only and checks source syntax, storage/worker tests and public DNS/TLS without changing production.
- `scripts/gabia-stage-release.sh` stages a release directory and runs tests; it intentionally does NOT restart services, modify DNS or replace production.
- SKYNET endpoints still need functional migration and integration testing.
- GitHub-to-Gabia deployment is NOT automated until server release paths and credentials are validated.
- Domain and TLS migration are NOT performed by these files.
- No Vercel shutdown, no customer job execution, no customer data mutation.
