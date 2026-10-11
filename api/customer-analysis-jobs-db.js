import {createHash,randomUUID} from 'node:crypto';
import {withLeaseDb} from './customer-analysis-lease-db.js';
import {assertCompletionTransition} from '../lib/analysis-stage-gates.mjs';
const key=user=>createHash('sha256').update(user).digest('hex');
const publicJob=r=>r&&({jobId:r.job_id,caseId:r.case_id,documentVersion:r.document_version,status:r.status,stage:r.stage,checkpoint:r.checkpoint,attempts:r.attempts,maxAttempts:r.max_attempts,errorCode:r.error_code,updatedAt:r.updated_at});
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
export async function getJob(user,caseId,id){return withLeaseDb(async db=>{const r=await db.query('SELECT * FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3',[key(user),caseId,id]);return publicJob(r.rows[0])})}
export async function claimJob(){
 return withLeaseDb(async db=>{const token=randomUUID(),r=await db.query(`WITH candidate AS (
 SELECT customer_key,case_id,job_id FROM customer_analysis_jobs
 WHERE (status IN ('queued','retry') AND next_run_at<=now())
 OR (status='running' AND lease_expires_at<now())
 ORDER BY next_run_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE customer_analysis_jobs j SET status='running',owner_token=$1,fence=fence+1,
 lease_expires_at=now()+interval '90 seconds',updated_at=now()
 FROM candidate c WHERE j.customer_key=c.customer_key AND j.case_id=c.case_id AND j.job_id=c.job_id
 RETURNING j.*`,[token]);return r.rows[0]?{...publicJob(r.rows[0]),customerKey:r.rows[0].customer_key,token,fence:String(r.rows[0].fence)}:null});
}
export async function advanceJob(job,stage,checkpoint,status='running',errorCode=null){
 if(!['running','retry','blocked','completed','failed'].includes(status))throw Error('INVALID_STATUS');
 assertCompletionTransition(status,checkpoint);
 return withLeaseDb(async db=>{const r=await db.query(`UPDATE customer_analysis_jobs SET stage=$6,checkpoint=$7::jsonb,status=$8,error_code=$9,attempts=CASE WHEN $6='error' THEN attempts+1 ELSE attempts END,
 lease_expires_at=CASE WHEN $8='running' THEN now()+interval '90 seconds' ELSE NULL END,
 next_run_at=CASE WHEN $8='retry' THEN now()+CASE WHEN $6 IN ('text_review_checkpoint','text_review_finalize_checkpoint','pdf_extraction_checkpoint','pdf_extraction_completed') THEN interval '2 seconds' ELSE LEAST(3600,POWER(2,LEAST(attempts,10))) * interval '1 second' END ELSE next_run_at END,
 owner_token=CASE WHEN $8='running' THEN owner_token ELSE NULL END,updated_at=now()
 WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND owner_token=$4 AND fence=$5 AND lease_expires_at>now()
 RETURNING *`,[job.customerKey,job.caseId,job.jobId,job.token,job.fence,stage,JSON.stringify(checkpoint),status,errorCode]);if(!r.rows[0])throw Error('JOB_LEASE_LOST');return publicJob(r.rows[0])});
}

export async function resumeJob(user,caseId,jobId,version){
 return withLeaseDb(async db=>{
  const r=await db.query("UPDATE customer_analysis_jobs SET status='queued',stage='resume_requested',error_code=NULL,next_run_at=now(),updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND job_id=$3 AND document_version=$4 AND status='blocked' AND error_code IS DISTINCT FROM 'VISUAL_EVIDENCE_NOT_VERIFIED' RETURNING *",[key(user),caseId,jobId,version]);
  return publicJob(r.rows[0]);
 });
}
