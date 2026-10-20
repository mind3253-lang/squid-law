// A preliminary report is durable, but is NOT a verified legal completion.
export const gabiaMarkPreliminarySql=`UPDATE gabia_customer_jobs
 SET status='blocked',stage='preliminary_report_written',
 error_code='INDEPENDENT_LEGAL_REVIEW_PENDING',
 checkpoint=$6::jsonb,worker_id=NULL,lease_expires_at=NULL,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND worker_id=$4
 AND fencing_token=$5 AND status='running' AND lease_expires_at>now()
 RETURNING job_id`;
export async function markGabiaPreliminary(pool,{job,workerId,checkpoint}){
 if(!pool?.query||!job||typeof workerId!=='string'||!checkpoint?.preliminaryReport)throw Error('INVALID_PRELIMINARY_CHECKPOINT');
 const r=await pool.query(gabiaMarkPreliminarySql,[job.customer_key,job.case_id,job.job_id,workerId,job.fencing_token,JSON.stringify(checkpoint)]);
 if(r.rowCount!==1)throw Error('QUEUE_LEASE_LOST');
 return r.rows[0];
}
