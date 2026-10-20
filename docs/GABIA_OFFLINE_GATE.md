# Phase 5 offline verification gate
GitHub Actions runs the read-only Gabia source and unit-test gate on relevant main branch changes, or manually.
The gate does not contact the Gabia VPS, migrate data, restart a worker, edit DNS or decommission Vercel.
Passing this gate is necessary but insufficient for live E2E, load, recovery and security acceptance.
