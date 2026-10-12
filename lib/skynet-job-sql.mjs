export const SKYNET_JOB_SCHEMA=`CREATE TABLE IF NOT EXISTS skynet_jobs (id text PRIMARY KEY, payload jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS skynet_jobs_updated_idx ON skynet_jobs(updated_at DESC)`;
export function validRevision(value){return Number.isSafeInteger(value)&&value>=1}
