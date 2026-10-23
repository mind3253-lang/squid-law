import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {withLeaseDb} from './customer-analysis-lease-db.js';
const safe=(v,n=180)=>String(v??'').replace(/(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|[?&](?:token|key|secret|password|access_token|refresh_token)=[^&\s]+)/ig,'[redacted]').replace(/https?:\/\/\S+/ig,'[URL_REDACTED]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[EMAIL_REDACTED]').slice(0,n);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  const limit=Math.max(1,Math.min(100,Number(req.query?.limit)||40));
  const traceFilter=String(req.query?.traceId||'').slice(0,80);
  const healthOnly=String(req.query?.health||'')==='1';
  if(healthOnly&&traceFilter)return res.status(400).json({error:'HEALTH_TRACE_CONFLICT'});
  if(traceFilter&&!/^(?:ERR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|AN-[a-f0-9]{16})$/.test(traceFilter))return res.status(400).json({error:'INVALID_TRACE_ID'});
  let rows=[],jobsStatus='available';
  try{rows=await withLeaseDb(async db=>(await db.query(
   `SELECT job_id,status,stage,error_code,updated_at,checkpoint->>'errorTraceId' AS trace,
   checkpoint->>'lastFailureStage' AS failure_stage,
   checkpoint->>'lastFailureCursor' AS failure_cursor,
   checkpoint->>'errorClass' AS error_class,
   checkpoint->>'errorStackFrame' AS stack_frame,
   checkpoint->>'providerErrorSummary' AS provider_summary,
   checkpoint->>'message' AS detail
   FROM customer_analysis_jobs WHERE error_code IS NOT NULL
   AND ($2::text='' OR checkpoint->>'errorTraceId'=$2)
   ORDER BY updated_at DESC LIMIT $1`,[healthOnly?0:limit,traceFilter])).rows)}catch(e){jobsStatus=e?.code==='42P01'?'schema_missing':'query_failed';console.error('ANALYSIS_DIAGNOSTIC_READ_FAILURE',safe(e?.code||e?.name||'UNKNOWN',50))}
  let central=[],centralStatus='available';
  try{central=await withLeaseDb(async db=>(await db.query(
   `SELECT trace_id,created_at,system,operation,stage,code,error_name,message,source
    FROM squid_error_diagnostics WHERE ($2::text='' OR trace_id=$2) ORDER BY created_at DESC LIMIT $1`,[healthOnly?0:limit,traceFilter])).rows)}
  catch(e){centralStatus=e?.code==='42P01'?'schema_missing':'query_failed';console.error('CENTRAL_DIAGNOSTIC_READ_FAILURE',safe(e?.code||e?.name||'UNKNOWN',50))}
  return res.status(200).json({ok:jobsStatus==='available'&&centralStatus==='available',source:'customer_analysis_jobs',jobsStatus,centralStatus,central:central.map(r=>({traceId:safe(r.trace_id,60),time:r.created_at,system:safe(r.system,32),operation:safe(r.operation,80),stage:safe(r.stage,80),code:safe(r.code,100),name:safe(r.error_name,60),message:safe(r.message,180),source:safe(r.source,180)})),records:rows.map(r=>({
   traceId:safe(r.trace,50),jobId:safe(r.job_id,40),status:safe(r.status,20),
   code:safe(r.error_code,100),stage:safe(r.failure_stage||r.stage,100),
   cursor:r.failure_cursor===null?null:Number(r.failure_cursor),
   errorClass:safe(r.error_class,60),stackFrame:safe(r.stack_frame,180),
   summary:safe(r.provider_summary||r.detail,180),updatedAt:r.updated_at
  }))});
 }catch(e){console.error('SKYNET_DIAGNOSTIC_QUERY_FAILURE',safe(e?.code||e?.name||'UNKNOWN',60));return res.status(503).json({error:'DIAGNOSTIC_QUERY_UNAVAILABLE'})}
}