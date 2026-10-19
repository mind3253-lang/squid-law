// Independent PostgreSQL schema, additive and isolated from Vercel customer tables.
// Apply only to a separately provisioned Gabia database after review.
export const gabiaSchemaSql = `
CREATE TABLE IF NOT EXISTS gabia_customer_jobs (
 customer_key char(64) NOT NULL CHECK (customer_key ~ '^[a-f0-9]{64}$'),
 case_id uuid NOT NULL,
 job_id uuid NOT NULL,
 document_version char(64) NOT NULL CHECK (document_version ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','retry','blocked','completed','failed')),
 stage text NOT NULL DEFAULT 'queued',
 checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
 result_path text,
 error_code text,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (customer_key,case_id,job_id)
);
CREATE INDEX IF NOT EXISTS gabia_customer_jobs_queue_idx
 ON gabia_customer_jobs (created_at,job_id) WHERE status IN ('queued','retry');
CREATE INDEX IF NOT EXISTS gabia_customer_jobs_owner_idx
 ON gabia_customer_jobs (customer_key,case_id,created_at DESC);
`;
export async function ensureGabiaSchema(pool){
 if(!pool||typeof pool.query!=='function')throw Error('GABIA_DB_NOT_CONFIGURED');
 await pool.query(gabiaSchemaSql);
}
