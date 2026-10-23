import {createHash,randomUUID} from 'node:crypto';
import {withLeaseDb} from './customer-analysis-lease-db.js';
import {assertCompletionTransition} from '../lib/analysis-stage-gates.mjs';
import {scheduleCustomerWorker} from '../lib/customer-worker-dispatch.mjs';
import {shouldDispatchCustomerWorker} from '../lib/customer-worker-owner.mjs';
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
 ORDER BY created_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1
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
 next_run_at=CASE WHEN $8='retry' THEN now()+interval '250 milliseconds' ELSE next_run_at END,
 owner_token=CASE WHEN $8='running' THEN owner_token ELSE NULL END,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND owner_token=$4 AND fence=$5 AND status='running' AND lease_expires_at>now()
 RETURNING *`,[job.customerKey,job.caseId,job.jobId,job.token,job.fence,stage,JSON.stringify(checkpoint),status,errorCode]);
  if(!r.rows[0])throw Error('JOB_LEASE_LOST');
  return publicJob(r.rows[0]);
 });
 // Trigger the next checkpoint without waiting for the customer's browser
 // or the periodic cron. Claiming remains serialized by PG SKIP LOCKED/fence.
 if(shouldDispatchCustomerWorker()&&status==='retry'&&stage!=='error')scheduleCustomerWorker({delayMs:350});
 if(shouldDispatchCustomerWorker()&&status==='completed')scheduleCustomerWorker({delayMs:350});
 return result;
}
export async function renewJobLease(job){
 return withLeaseDb(async db=>{
  const r=await db.query(`UPDATE customer_analysis_jobs SET
   lease_expires_at=now()+interval '90 seconds'
   WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND owner_token=$4
    AND fence=$5 AND status='running' AND lease_expires_at>now()
   RETURNING job_id`,[job.customerKey,job.caseId,job.jobId,job.token,job.fence]);
  if(r.rowCount!==1)throw Error('JOB_LEASE_LOST');
  return true;
 });
}

export async function resumeJob(user,caseId,jobId,version){
 return withLeaseDb(async db=>{
  const r=await db.query("UPDATE customer_analysis_jobs SET status='queued',stage='resume_requested',error_code=NULL,attempts=0,next_run_at=now(),updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4 AND status IN ('blocked','failed') AND error_code IS DISTINCT FROM 'VISUAL_EVIDENCE_NOT_VERIFIED' AND (error_code NOT LIKE 'VISION_PDF_%' OR (error_code='VISION_PDF_INVALID_PAGE' AND checkpoint->'visionPageDiagnostic'->>'reason'='observation_schema_invalid')) RETURNING *",[key(user),caseId,jobId,version]);
  if(r.rows[0])return publicJob(r.rows[0]);
  // A repeated resume request must not reset a job already queued or running.
  // Preserve its checkpoint, attempts, lease and owner fence unchanged.
  const active=await db.query("SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4 AND status IN ('queued','running','retry') LIMIT 1",[key(user),caseId,jobId,version]);
  return publicJob(active.rows[0]);
 });
}

// Recover only the infrastructure-specific missing-index failure. Preserve
// document version, immutable receipts and checkpoints; never restart billing.
export async function recoverMissingRegistryJobs(){
 return withLeaseDb(async db=>{
  const r=await db.query(`UPDATE customer_analysis_jobs
   SET status='queued',stage='resume_requested',error_code=NULL,attempts=0,
       next_run_at=now(),updated_at=now()
   WHERE status='failed' AND error_code='CASE_NOT_FOUND'
   RETURNING job_id`);
  return r.rowCount;
 });
}

export async function queueSnapshot(user,caseId,id){
 return withLeaseDb(async db=>{
  const target=await db.query('SELECT created_at,job_id,status,(next_run_at<=now()) AS ready_now FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3',[key(user),caseId,id]);
  const t=target.rows[0];if(!t)return null;
  const r=await db.query(`WITH earlier AS (
   SELECT count(*)::integer AS ahead, count(*) FILTER (WHERE status='running' AND lease_expires_at>now())::integer AS running_ahead FROM customer_analysis_jobs
   WHERE ((status IN ('queued','retry') AND next_run_at<=now()) OR (status='running' AND lease_expires_at>now()))
   AND (created_at,job_id)<($1::timestamptz,$2::uuid)
  ),running AS (
   SELECT count(*)::integer AS active FROM customer_analysis_jobs WHERE status='running' AND lease_expires_at>now()
  ),history AS (
   SELECT count(*)::integer AS completed,avg(extract(epoch FROM updated_at-created_at))::float AS avg_seconds
   FROM (SELECT created_at,updated_at FROM customer_analysis_jobs WHERE status='completed' ORDER BY updated_at DESC LIMIT 30) x
  ) SELECT earlier.ahead,earlier.running_ahead,running.active,history.completed,history.avg_seconds FROM earlier,running,history`,[t.created_at,t.job_id]);
  const v=r.rows[0];const waiting=['queued','retry'].includes(t.status);
  const eligible=waiting&&t.ready_now===true;
  return {ahead:eligible?v.ahead:0,position:eligible?v.ahead+1:null,active:v.active,
   estimatedStartSeconds:eligible&&v.completed>=3&&v.avg_seconds>0?Math.ceil((v.ahead+Math.max(0,v.active-v.running_ahead))*v.avg_seconds):null,
   estimateBasis:v.completed,estimateMethod:'historical_completed_jobs_30',retryBackoff:waiting&&!eligible};
 });
}

export async function latestCaseJob(user,caseId){return withLeaseDb(async db=>{const r=await db.query('SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 ORDER BY created_at DESC,job_id DESC LIMIT 1',[key(user),caseId]);return publicJob(r.rows[0]);});}

// Permit removing a mistaken additional document only when the remaining source
// set is an already completed immutable baseline. Never remove evidence used
// by an active or completed report.
export async function mayDiscardAdditionalDocument(user,caseId,remainingVersion,currentVersion){
 return withLeaseDb(async db=>{
  const k=key(user);
  const rows=await db.query("SELECT status,document_version FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2",[k,caseId]);
  if(rows.rows.some(x=>['running','queued','retry'].includes(x.status)))return false;
  return rows.rows.some(x=>x.status==='completed'&&x.document_version===remainingVersion)
   &&!rows.rows.some(x=>x.status==='completed'&&x.document_version===currentVersion);
 });
}
