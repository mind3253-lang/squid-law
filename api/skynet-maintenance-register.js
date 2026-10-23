import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {requireAtomicJobs,writeJob} from '../lib/skynet-job-store-router.mjs';
import {maintenanceJobFromDiagnostic} from '../lib/skynet-maintenance-registration.mjs';
import {withLeaseDb} from './customer-analysis-lease-db.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  requireAtomicJobs();
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const traceId=String(body?.traceId||'');
  if(!/^ERR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(traceId))
   return res.status(400).json({error:'INVALID_TRACE_ID'});
  // The client cannot submit its own code or diagnostic payload: read trusted server data.
  const result=await withLeaseDb(async db=>db.query(
   `SELECT error_code AS code,checkpoint->'sourceDiagnostic' AS diagnostic
    FROM customer_analysis_jobs WHERE checkpoint->>'errorTraceId'=$1
    AND error_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,[traceId]));
  if(!result.rows.length)return res.status(404).json({error:'DIAGNOSTIC_NOT_FOUND'});
  const row=result.rows[0];
  const job=maintenanceJobFromDiagnostic({traceId,code:row.code,diagnostic:row.diagnostic||{reason:'UNKNOWN'}});
  try{await writeJob(job,{overwrite:false})}
  catch(e){if(e?.message==='JOB_ALREADY_EXISTS')return res.status(200).json({ok:true,alreadyRegistered:true,jobId:job.id});throw e}
  return res.status(201).json({ok:true,jobId:job.id,registered:true,requiresApproval:true});
 }catch(e){
  console.error('SKYNET_MAINTENANCE_REGISTER_FAILED',String(e?.code||e?.message||'UNKNOWN').slice(0,80));
  return res.status(503).json({error:'MAINTENANCE_REGISTRATION_UNAVAILABLE'});
 }
}
