import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {withLeaseDb} from './customer-analysis-lease-db.js';
const safe=(v,n=180)=>String(v??'').replace(/(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|[?&](?:token|key|secret|password)=[^&\s]+)/ig,'[redacted]').slice(0,n);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  const limit=Math.max(1,Math.min(100,Number(req.query?.limit)||40));
  const rows=await withLeaseDb(async db=>(await db.query(
   `SELECT job_id,status,stage,error_code,updated_at,checkpoint->>'errorTraceId' AS trace,
   checkpoint->>'lastFailureStage' AS failure_stage,
   checkpoint->>'lastFailureCursor' AS failure_cursor,
   checkpoint->>'errorClass' AS error_class,
   checkpoint->>'errorStackFrame' AS stack_frame,
   checkpoint->>'providerErrorSummary' AS provider_summary,
   checkpoint->>'message' AS detail
   FROM customer_analysis_jobs WHERE error_code IS NOT NULL
   ORDER BY updated_at DESC LIMIT $1`,[limit])).rows);
  return res.status(200).json({ok:true,source:'customer_analysis_jobs',records:rows.map(r=>({
   traceId:safe(r.trace,50),jobId:safe(r.job_id,40),status:safe(r.status,20),
   code:safe(r.error_code,100),stage:safe(r.failure_stage||r.stage,100),
   cursor:r.failure_cursor===null?null:Number(r.failure_cursor),
   errorClass:safe(r.error_class,60),stackFrame:safe(r.stack_frame,180),
   summary:safe(r.provider_summary||r.detail,180),updatedAt:r.updated_at
  }))});
 }catch(e){console.error('SKYNET_DIAGNOSTIC_QUERY_FAILURE',safe(e?.code||e?.name||'UNKNOWN',60));return res.status(503).json({error:'DIAGNOSTIC_QUERY_UNAVAILABLE'})}
}