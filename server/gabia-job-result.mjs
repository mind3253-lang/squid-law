// Complete only a lease-owned job with independently verified, immutable report metadata.
export const gabiaCompleteJobSql=`UPDATE gabia_customer_jobs SET
 status='completed',stage='completed',result_path=$6,error_code=NULL,
 worker_id=NULL,lease_expires_at=NULL,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3
 AND worker_id=$4 AND fencing_token=$5
 AND status='running' AND lease_expires_at>now()
 RETURNING job_id`;
export async function completeGabiaJob(pool,{job,workerId,resultPath,verified=false}){
 if(!pool?.query||verified!==true||!job||typeof workerId!=='string'||
 typeof resultPath!=='string'||!/^reports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.json$/.test(resultPath))throw Error('UNVERIFIED_GABIA_RESULT');
 const r=await pool.query(gabiaCompleteJobSql,[job.customer_key,job.case_id,job.job_id,workerId,job.fencing_token,resultPath]);
 if(r.rowCount!==1)throw Error('QUEUE_LEASE_LOST');
 return r.rows[0];
}
