// Atomic lease fencing SQL for the Gabia-only queue; not enabled by default.
export const gabiaClaimSql=`WITH candidate AS (
 SELECT customer_key,case_id,job_id FROM gabia_customer_jobs
 WHERE status='queued' OR (status='running' AND lease_expires_at < now() AND attempts < max_attempts)
 ORDER BY created_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE gabia_customer_jobs j
 SET status='running',worker_id=$1,lease_expires_at=now()+interval '120 seconds',
 fencing_token=j.fencing_token+1,attempts=j.attempts+1,updated_at=now()
 FROM candidate c WHERE j.customer_key=c.customer_key AND j.case_id=c.case_id AND j.job_id=c.job_id
 RETURNING j.*`;
export const gabiaCheckpointSql=`UPDATE gabia_customer_jobs
 SET checkpoint=$6::jsonb,stage=$7,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3
 AND worker_id=$4 AND fencing_token=$5 AND status='running'
 AND lease_expires_at>now() RETURNING job_id`;
