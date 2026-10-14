import {createHash,randomUUID} from 'node:crypto';
import {withLeaseDb} from './customer-analysis-lease-db.js';
import {assertCompletionTransition} from '../lib/analysis-stage-gates.mjs';
import {scheduleCustomerWorker} from '../lib/customer-worker-dispatch.mjs';
import {CUSTOMER_PRODUCT_CONTRACT} from '../lib/customer-product-contract.mjs';
const key=user=>createHash('sha256').update(user).digest('hex');
const publicJob=r=>r&&({jobId:r.job_id,caseId:r.case_id,documentVersion:r.document_version,status:r.status,stage:r.stage,checkpoint:r.checkpoint,attempts:r.attempts,maxAttempts:r.max_attempts,errorCode:r.error_code,updatedAt:r.updated_at,createdAt:r.created_at});
export const documentVersion=docs=>createHash('sha256').update(JSON.stringify([...docs].map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
export async function enqueueJob(user,caseId,version){
 return withLeaseDb(async db=>{
  const k=key(user),id=randomUUID();
  const {rows}=await db.query(`INSERT INTO customer_analysis_jobs(customer_key,case_id,job_id,document_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,[k,caseId,id,version]);
  if(rows.length)return publicJob(rows[0]);
  const existing=await db.query("SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND document_version=$3 AND status IN ('queued','running','retry','blocked') ORDER BY created_at DESC LIMIT 1",[k,caseId,version]);
  if(!existing.rows[0])throw Error('JOB_CONFLICT_RETRY');
  return publicJob(existing.rows[0]);
 });
}
// Completed jobs are potential immutable baselines for evidence-addition reanalysis.
// Ownership is scoped by the same customer hash and case as the queued job.
export async function completedCaseBaselines(job,limit=30){
 if(!job?.customerKey||!job.caseId||!job.jobId)throw Error('INVALID_DELTA_BASELINE_LOOKUP');
 return withLeaseDb(async db=>{
  const r=await db.query("SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id<>$3 AND status='completed' ORDER BY updated_at DESC LIMIT $4",
   [job.customerKey,job.caseId,job.jobId,Math.min(100,Math.max(1,limit))]);
  return r.rows.map(publicJob);
 });
}
export async function getJob(user,caseId,id){return withLeaseDb(async db=>{const r=await db.query('SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3',[key(user),caseId,id]);return publicJob(r.rows[0])})}
/**
 * A single GLOBAL customer-analysis lane. SKIP LOCKED on a job row is NOT a
 * global concurrency guard: simultaneous requests can lock distinct rows.
 *
 * The transaction-scoped advisory lock serializes the active-job check and
 * candidate claim across all worker processes. The durable running lease
 * blocks later workers until checkpoint/retry/completion (or lease expiry).
 * No customer data is dropped and leases remain fenced by owner token.
 */
export async function claimJob(){
 return withLeaseDb(async db=>{
  if(CUSTOMER_PRODUCT_CONTRACT.analysisConcurrency!==1)
   throw Error('CUSTOMER_SINGLE_ANALYSIS_POLICY_VIOLATION');
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   // Reserved fixed advisory-lock namespace for the customer analysis lane.
   // Lock is held only during this transaction, not for the full AI call.
   await client.query('SELECT pg_advisory_xact_lock(208387541, 1)');
   const active=await client.query(
    "SELECT 1 FROM customer_analysis_jobs WHERE status='running' AND lease_expires_at>now() LIMIT 1"
   );
   if(active.rows.length){
    await client.query('COMMIT');
    return null;
   }
   const token=randomUUID();
   const r=await client.query(`WITH candidate AS (
 SELECT customer_key,case_id,job_id FROM customer_analysis_jobs
 WHERE (status IN ('queued','retry') AND next_run_at<=now())
 OR (status='running' AND lease_expires_at<now())
 ORDER BY next_run_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE customer_analysis_jobs j SET status='running',owner_token=$1,fence=fence+1,
 lease_expires_at=now()+interval '90 seconds',updated_at=now()
 FROM candidate c WHERE j.customer_key=c.customer_key AND j.case_id=c.case_id AND j.job_id=c.job_id
 RETURNING j.*`,[token]);
   await client.query('COMMIT');
   return r.rows[0]?{...publicJob(r.rows[0]),customerKey:r.rows[0].customer_key,token,
    fence:String(r.rows[0].fence)}:null;
  }catch(e){
   await client.query('ROLLBACK').catch(()=>{});
   throw e;
  }finally{client.release()}
 });
}
export async function advanceJob(job,stage,checkpoint,status='running',errorCode=null){
 if(!['running','retry','blocked','completed','failed'].includes(status))throw Error('INVALID_STATUS');
 assertCompletionTransition(status,checkpoint);
 const result=await withLeaseDb(async db=>{
  const r=await db.query(`UPDATE customer_analysis_jobs SET stage=$6,checkpoint=$7::jsonb,status=$8,error_code=$9,attempts=CASE WHEN $6='error' THEN attempts+1 ELSE attempts END,
 lease_expires_at=CASE WHEN $8='running' THEN now()+interval '90 seconds' ELSE NULL END,
 next_run_at=CASE WHEN $8='retry' THEN now()+CASE WHEN $6='error' THEN LEAST(3600,POWER(2,LEAST(attempts,10))) * interval '1 second' ELSE interval '250 milliseconds' END ELSE next_run_at END,
 owner_token=CASE WHEN $8='running' THEN owner_token ELSE NULL END,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND owner_token=$4 AND fence=$5 AND lease_expires_at>now()
 RETURNING *`,[job.customerKey,job.caseId,job.jobId,job.token,job.fence,stage,JSON.stringify(checkpoint),status,errorCode]);
  if(!r.rows[0])throw Error('JOB_LEASE_LOST');
  return publicJob(r.rows[0]);
 });
 // Trigger the next checkpoint without waiting for the customer's browser
 // or the periodic cron. Claiming remains serialized by PG SKIP LOCKED/fence.
 if(status==='retry'&&stage!=='error')scheduleCustomerWorker({delayMs:600});
 // A transient provider/transport failure should retry after its persisted
 // SQL backoff, not stall until the next 5-minute cron. Limit immediate
 // re-dispatch to the first four attempts; repeated failures still back off.
 if(status==='retry'&&stage==='error'&&Number(job.attempts||0)<4)
  scheduleCustomerWorker({delayMs:Math.min(9500,2**Math.min(3,Number(job.attempts||0))*1000+750)});
 if(status==='completed')scheduleCustomerWorker({delayMs:600});
 return result;
}
export async function renewJobLease(job){
 return withLeaseDb(async db=>{
  const r=await db.query(`UPDATE customer_analysis_jobs SET
   lease_expires_at=now()+interval '90 seconds',updated_at=now()
   WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND owner_token=$4
    AND fence=$5 AND status='running' AND lease_expires_at>now()
   RETURNING job_id`,[job.customerKey,job.caseId,job.jobId,job.token,job.fence]);
  if(r.rowCount!==1)throw Error('JOB_LEASE_LOST');
  return true;
 });
}

export async function resumeJob(user,caseId,jobId,version){
 return withLeaseDb(async db=>{
  const r=await db.query("UPDATE customer_analysis_jobs SET status='queued',stage='resume_requested',error_code=NULL,attempts=0,next_run_at=now(),updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4 AND status IN ('blocked','failed') AND error_code IS DISTINCT FROM 'VISUAL_EVIDENCE_NOT_VERIFIED' RETURNING *",[key(user),caseId,jobId,version]);
  return publicJob(r.rows[0]);
 });
}

export async function queueSnapshot(user,caseId,id){
 return withLeaseDb(async db=>{
  const r=await db.query(`WITH target AS (SELECT created_at FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3),
  earlier AS (SELECT count(*)::integer AS ahead FROM customer_analysis_jobs j,target t WHERE j.status IN ('queued','retry','running') AND (j.created_at,j.job_id)<(t.created_at,$3::uuid)),
  running AS (SELECT count(*)::integer AS active FROM customer_analysis_jobs WHERE status='running' AND lease_expires_at>now()),
  history AS (SELECT count(*)::integer AS completed,avg(extract(epoch FROM updated_at-created_at))::float AS avg_seconds FROM (SELECT created_at,updated_at FROM customer_analysis_jobs WHERE status='completed' ORDER BY updated_at DESC LIMIT 30) x)
  SELECT earlier.ahead,running.active,history.completed,history.avg_seconds FROM earlier,running,history`,[key(user),caseId,id]);
  const v=r.rows[0];return {ahead:v.ahead,position:v.ahead+1,active:v.active,estimatedStartSeconds:v.completed>=3&&v.avg_seconds>0?Math.ceil(v.ahead*v.avg_seconds):null,estimateBasis:v.completed};
 });
}
