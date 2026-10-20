-- Gabia isolated database schema. Apply manually after backup and review.
BEGIN;
CREATE TABLE IF NOT EXISTS gabia_customer_jobs (
 customer_key text NOT NULL, case_id uuid NOT NULL, job_id uuid NOT NULL,
 document_version char(64) NOT NULL, status text NOT NULL DEFAULT 'queued',
 stage text NOT NULL DEFAULT 'queued', error_code text, result_path text,
 checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
 worker_id text, lease_expires_at timestamptz,
 fencing_token bigint NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_key,case_id,job_id),
 CONSTRAINT gabia_job_status_check CHECK(status IN ('queued','running','retry','blocked','failed','completed'))
);
CREATE INDEX IF NOT EXISTS gabia_jobs_fifo_idx ON gabia_customer_jobs(status,created_at,job_id);
CREATE TABLE IF NOT EXISTS gabia_cases (
 customer_key text NOT NULL, case_id uuid NOT NULL, title text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 PRIMARY KEY(customer_key,case_id)
);
CREATE TABLE IF NOT EXISTS gabia_documents (
 customer_key text NOT NULL, case_id uuid NOT NULL, document_id uuid NOT NULL,
 source_sha256 char(64) NOT NULL, page_count integer NOT NULL CHECK(page_count>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_key,case_id,document_id),
 FOREIGN KEY(customer_key,case_id) REFERENCES gabia_cases(customer_key,case_id)
);
CREATE TABLE IF NOT EXISTS gabia_credit_ledger (
 customer_key text NOT NULL, reference text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('credit','debit','refund')),
 amount bigint NOT NULL CHECK(amount>0), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_key,reference)
);
CREATE TABLE IF NOT EXISTS skynet_messages (
 owner_key text NOT NULL, room_id uuid NOT NULL, message_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('user','assistant','system')), body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_key,room_id,message_id)
);
CREATE TABLE IF NOT EXISTS skynet_memories (
 owner_key text NOT NULL, memory_key text NOT NULL, body text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_key,memory_key)
);
COMMIT;
