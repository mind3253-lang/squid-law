-- One-time PostgreSQL schema initialization; safe to rerun.
CREATE TABLE IF NOT EXISTS squid_error_diagnostics (
 trace_id TEXT PRIMARY KEY,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 system TEXT NOT NULL,
 operation TEXT NOT NULL,
 stage TEXT,
 code TEXT NOT NULL,
 error_name TEXT,
 message TEXT,
 source TEXT,
 job_hash TEXT
);
CREATE INDEX IF NOT EXISTS squid_error_diagnostics_created_at_idx ON squid_error_diagnostics(created_at DESC);

-- Repair outcomes are independent of customer job completion.
CREATE TABLE IF NOT EXISTS squid_maintenance_repairs (
 trace_id TEXT PRIMARY KEY,
 repair_status TEXT NOT NULL CHECK (repair_status IN ('pending','diagnosing','repairing','verifying','verified','failed','reopened')),
 verification_method TEXT,
 verification_reference TEXT,
 verified_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS squid_maintenance_repairs_updated_idx ON squid_maintenance_repairs(updated_at DESC);
