-- SQUIDLAW customer analysis leases (PostgreSQL 15+)
-- Apply only to a dedicated customer-service database; no SKYNET tables.
CREATE TABLE IF NOT EXISTS customer_analysis_leases (
 customer_key text NOT NULL,
 case_id text NOT NULL,
 request_id uuid NOT NULL,
 request_hash char(64) NOT NULL,
 owner_token uuid,
 fencing_token bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','saving','completed','failed','recovery_required')),
 lease_expires_at timestamptz,
 attempt integer NOT NULL DEFAULT 0,
 last_completed_step text NOT NULL DEFAULT 'pending',
 result_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_key,case_id,request_id)
);
CREATE INDEX IF NOT EXISTS customer_analysis_leases_expiry ON customer_analysis_leases(lease_expires_at) WHERE status IN ('processing','saving');
-- Ownership/fencing transitions must be atomic UPDATE ... WHERE owner_token = $owner AND fencing_token = $fence AND lease_expires_at > now() RETURNING *.
-- Never automatically steal an expired processing lease if the AI call outcome is unknown.
