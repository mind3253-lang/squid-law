import {createHash,randomUUID} from 'node:crypto';
import {withLeaseDb} from './customer-analysis-lease-db.js';
import {assertCompletionTransition} from '../lib/analysis-stage-gates.mjs';
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
 * Claim one independent customer job. PostgreSQL's row lock and SKIP LOCKED
 * permit workers to claim different jobs concurrently, but never the same job
 * twice. The owner token and monotonically increasing fence protect every
 * checkpoint and lease renewal, including after a stale lease is reclaimed.
 * Cross-customer global locking is intentionally prohibited.
 */
export async function claimJob(){
 return withLeaseDb(async db=>{
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const token=randomUUID();
   const r=await client.query(`WITH candidate AS (
 SELECT customer_key,case_id,job_id FROM customer_analysis_jobs
 WHERE (status IN ('queued','retry') AND next_run_at<=now())
 OR (status='running' AND lease_expires_at<now())
 ORDER BY created_at,job_id FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE customer_analysis_jobs j SET status='running',owner_token=$1,fence=fence+1,
 lease_expires_at=now()+interval '90 seconds',updated_at=now(),
 checkpoint=jsonb_set(COALESCE(j.checkpoint,'{}'::jsonb),'{analysisStartedAt}',COALESCE(j.checkpoint->'analysisStartedAt',to_jsonb(now()::text)),true)
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
 next_run_at=CASE WHEN $8='retry' AND $6='error' THEN now()+make_interval(secs=>LEAST(3600,POWER(2,LEAST(attempts,10))::integer))+interval '1250 milliseconds' WHEN $8='retry' THEN now()+interval '250 milliseconds' ELSE next_run_at END,
 owner_token=CASE WHEN $8='running' THEN owner_token ELSE NULL END,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND owner_token=$4 AND fence=$5 AND status='running' AND lease_expires_at>now()
 RETURNING *`,[job.customerKey,job.caseId,job.jobId,job.token,job.fence,stage,JSON.stringify(checkpoint),status,errorCode]);
  if(!r.rows[0])throw Error('JOB_LEASE_LOST');
  return publicJob(r.rows[0]);
 });
 // The approved Gabia continuous worker polls the durable PostgreSQL queue.
 // No per-checkpoint remote dispatch is needed.
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
  const r=await db.query("UPDATE customer_analysis_jobs SET status='queued',stage='resume_requested',error_code=NULL,attempts=0,next_run_at=now(),updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4 AND status IN ('blocked','failed') AND error_code IS DISTINCT FROM 'VISUAL_EVIDENCE_NOT_VERIFIED' AND (error_code NOT LIKE 'VISION_PDF_%' OR error_code LIKE 'VISION_PDF_UPLOAD_%' OR error_code LIKE 'VISION_PDF_API_5%' OR error_code='VISION_PDF_INVALID_PAGE' AND checkpoint->'visionPageDiagnostic'->>'reason'='observation_schema_invalid') RETURNING *",[key(user),caseId,jobId,version]);
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
   SELECT count(*)::integer AS ahead FROM customer_analysis_jobs
   WHERE status IN ('queued','retry') AND next_run_at<=now()
   AND (created_at,job_id)<($1::timestamptz,$2::uuid)
  ),running AS (
   SELECT count(*)::integer AS active FROM customer_analysis_jobs WHERE status='running' AND lease_expires_at>now()
  ) SELECT earlier.ahead,running.active FROM earlier,running`,[t.created_at,t.job_id]);
  const v=r.rows[0];const waiting=['queued','retry'].includes(t.status);
  const eligible=waiting&&t.ready_now===true;
  return {ahead:eligible?v.ahead:0,position:eligible?v.ahead+1:null,active:v.active,
   // A global single-lane ETA is false under capacity-dependent parallelism.
   estimatedStartSeconds:null,estimateBasis:0,estimateMethod:'dynamic_parallel_capacity_no_reliable_eta',retryBackoff:waiting&&!eligible};
 });
}

export async function latestCaseJob(user,caseId){return withLeaseDb(async db=>{const r=await db.query('SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 ORDER BY created_at DESC,job_id DESC LIMIT 1',[key(user),caseId]);return publicJob(r.rows[0]);});}

// Permit removing a mistaken additional document only when the remaining source
// set is an already completed immutable baseline. Never remove evidence used
// by an active or completed report.
export async function mayDiscardAdditionalDocument(user,caseId,remainingVersion,currentVersion,remainingDocs=null,targetId=null){
 return withLeaseDb(async db=>{
  const k=key(user);
  const rows=await db.query("SELECT status,document_version,checkpoint FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2",[k,caseId]);
  if(rows.rows.some(x=>['running','queued','retry'].includes(x.status)))return false;
  const completed=rows.rows.filter(x=>x.status==='completed');
  if(completed.some(x=>x.document_version===currentVersion))return false;
  if(completed.some(x=>x.document_version===remainingVersion))return true;
  // An unrelated upload may be followed by another upload before it is discarded.
  // Protect every completed source set, rather than requiring the remaining set
  // to equal a completed version exactly. Unknown legacy snapshots fail closed.
  if(!Array.isArray(remainingDocs)||!targetId||!completed.length)return false;
  const byId=new Map(remainingDocs.map(d=>[d.id,d]));
  return completed.every(x=>{
   const snapshot=x.checkpoint?.deltaDocumentSnapshot;
   if(!Array.isArray(snapshot)||!snapshot.length)return false;
   if(snapshot.some(d=>!d?.id||d.id===targetId||!byId.has(d.id)))return false;
   const baseline=snapshot.map(d=>byId.get(d.id));
   return documentVersion(baseline)===x.document_version;
  });
 });
}

export async function completedCustomerReports(user,caseId,limit=100){
 return withLeaseDb(async db=>{
  const r=await db.query("SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND status='completed' AND checkpoint->>'legalCustomerReport' IS NOT NULL ORDER BY updated_at DESC LIMIT $3",[key(user),caseId,Math.min(200,Math.max(1,limit))]);
  return r.rows.map(publicJob);
 });
}

export async function confirmDocumentRelevance(user,caseId,jobId,version,documentId,explanation){
 return withLeaseDb(async db=>{
  const r=await db.query(`UPDATE customer_analysis_jobs
   SET checkpoint=jsonb_set(jsonb_set(coalesce(checkpoint,'{}'::jsonb),'{relevanceClarifications}',
    coalesce(checkpoint->'relevanceClarifications','{}'::jsonb)||jsonb_build_object($5::text,$6::text),true),'{relevanceAttempts}',to_jsonb(coalesce((checkpoint->>'relevanceAttempts')::integer,0)+1),true),
   status='queued',stage='relevance_customer_explained',error_code=NULL,attempts=0,next_run_at=now(),updated_at=now()
   WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4
   AND status='blocked' AND error_code='DOCUMENT_RELEVANCE_REVIEW_REQUIRED'
   AND coalesce((checkpoint->>'relevanceAttempts')::integer,0) < 3
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(checkpoint->'relevanceDecisions','[]'::jsonb)) x WHERE x->>'id'=$5 AND x->>'status'='clarify')
   RETURNING *`,[key(user),caseId,jobId,version,documentId,explanation]);
  return publicJob(r.rows[0]);
 });
}

export async function acceptCustomerRequestedEvidence(user,caseId,jobId,version,documentIds){
 return withLeaseDb(async db=>{
  const r=await db.query(`UPDATE customer_analysis_jobs
   SET checkpoint=jsonb_set(coalesce(checkpoint,'{}'::jsonb),'{customerIncludeUnverified}',to_jsonb($5::text[]),true),
    status='queued',stage='relevance_customer_include',error_code=NULL,attempts=0,next_run_at=now(),updated_at=now()
   WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4
    AND status='blocked' AND error_code='DOCUMENT_RELEVANCE_REVIEW_REQUIRED'
    AND (SELECT count(*) FROM jsonb_array_elements(coalesce(checkpoint->'relevanceDecisions','[]'::jsonb)) x
      WHERE x->>'status'='clarify')=cardinality($5::text[])
    AND NOT EXISTS(SELECT 1 FROM unnest($5::text[]) d WHERE NOT EXISTS
      (SELECT 1 FROM jsonb_array_elements(coalesce(checkpoint->'relevanceDecisions','[]'::jsonb)) x WHERE x->>'id'=d AND x->>'status'='clarify'))
   RETURNING *`,[key(user),caseId,jobId,version,documentIds]);
  return publicJob(r.rows[0]);
 });
}

export async function closeDiscardedDocumentReview(user,caseId,documentId){
 return withLeaseDb(async db=>{
  await db.query(`UPDATE customer_analysis_jobs
   SET status='failed',stage='customer_discarded_document',error_code='CUSTOMER_DISCARDED_DOCUMENT',updated_at=now()
   WHERE customer_key=$1 AND case_id=$2 AND status='blocked'
   AND error_code='DOCUMENT_RELEVANCE_REVIEW_REQUIRED'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(checkpoint->'relevanceDecisions','[]'::jsonb)) x WHERE x->>'id'=$3)`,
   [key(user),caseId,documentId]);
  return true;
 });
}
