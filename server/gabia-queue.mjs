// Gabia-only queue; explicit DB pool and no worker activation.
import {gabiaClaimSql,gabiaCheckpointSql,gabiaExpireSql} from './gabia-queue-sql.mjs';
export function createGabiaQueue(pool){
 if(!pool?.query)throw Error('GABIA_DB_NOT_CONFIGURED');
 return {
  async expireExhausted(){
   const r=await pool.query(gabiaExpireSql);
   return r.rowCount;
  },
  async claim(workerId){
   if(typeof workerId!=='string'||!/^[A-Za-z0-9_-]{3,80}$/.test(workerId))throw Error('INVALID_WORKER_ID');
   const r=await pool.query(gabiaClaimSql,[workerId]);
   return r.rows[0]||null;
  },
  async checkpoint({job,workerId,checkpoint,stage}){
   if(!job||!Number.isSafeInteger(Number(job.fencing_token))||typeof workerId!=='string'||!checkpoint||typeof checkpoint!=='object'||Array.isArray(checkpoint)||typeof stage!=='string')throw Error('INVALID_CHECKPOINT');
   const r=await pool.query(gabiaCheckpointSql,[job.customer_key,job.case_id,job.job_id,workerId,job.fencing_token,JSON.stringify(checkpoint),stage]);
   if(r.rowCount!==1)throw Error('QUEUE_LEASE_LOST');
   return r.rows[0];
  }
 };
}
