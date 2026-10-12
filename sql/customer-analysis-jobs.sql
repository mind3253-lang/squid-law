-- SQUIDLAW customer analysis jobs: additive migration, no existing rows removed.
CREATE TABLE IF NOT EXISTS customer_analysis_jobs (
 customer_key text NOT NULL,
 case_id text NOT NULL,
 job_id uuid NOT NULL,
 document_version text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 stage text NOT NULL DEFAULT 'queued',
 checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 5,
 error_code text,
 owner_token uuid,
 fence bigint NOT NULL DEFAULT 0,
 lease_expires_at timestamptz,
 next_run_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (customer_key,case_id,job_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_analysis_jobs_active_version
 ON customer_analysis_jobs(customer_key,case_id,document_version)
 WHERE status IN ('queued','running','retry','blocked');
CREATE INDEX IF NOT EXISTS customer_analysis_jobs_claim
 ON customer_analysis_jobs(next_run_at,created_at)
 WHERE status IN ('queued','retry','running');
