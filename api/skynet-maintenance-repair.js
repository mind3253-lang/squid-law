import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {withLeaseDb} from './customer-analysis-lease-db.js';
import {verifyRepairTransition} from '../lib/skynet-maintenance-policy.mjs';
const TRACE=/^ERR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}
 catch{return res.status(400).json({error:'INVALID_JSON'})}
 const traceId=String(body.traceId||''),status=String(body.status||'');
 if(!TRACE.test(traceId))return res.status(400).json({error:'INVALID_TRACE_ID'});
 const method=String(body.verificationMethod||'').slice(0,80),reference=String(body.verificationReference||'').slice(0,160);
 if((method&&!/^[A-Za-z0-9_.:-]+$/.test(method))||(reference&&!/^[A-Za-z0-9_.:-]+$/.test(reference)))
  return res.status(400).json({error:'INVALID_VERIFICATION_REFERENCE'});
 try{
  const result=await withLeaseDb(async db=>{
   await db.query('BEGIN');
   try{
    // Serialize transitions per trace without mutating original diagnostic records.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[traceId]);
    const source=await db.query(`SELECT trace_id FROM squid_error_diagnostics WHERE trace_id=$1
      UNION ALL SELECT checkpoint->>'errorTraceId' FROM customer_analysis_jobs
      WHERE checkpoint->>'errorTraceId'=$1 LIMIT 1`,[traceId]);
    if(!source.rows.length){await db.query('ROLLBACK');return {missing:true}}
    const previous=await db.query('SELECT repair_status FROM squid_maintenance_repairs WHERE trace_id=$1',[traceId]);
    let transition;
    try{transition=verifyRepairTransition(previous.rows[0]?.repair_status||'pending',status,{
      verificationMethod:method,verificationReference:reference})}
    catch(e){await db.query('ROLLBACK');return {invalid:String(e.message||'INVALID_TRANSITION')}}
    await db.query(`INSERT INTO squid_maintenance_repairs
      (trace_id,repair_status,verification_method,verification_reference,verified_at,updated_at)
      VALUES($1,$2,$3,$4,CASE WHEN $2='verified' THEN NOW() ELSE NULL END,NOW())
      ON CONFLICT(trace_id) DO UPDATE SET repair_status=EXCLUDED.repair_status,
      verification_method=EXCLUDED.verification_method,
      verification_reference=EXCLUDED.verification_reference,
      verified_at=EXCLUDED.verified_at,updated_at=NOW()`,
      [traceId,status,transition.verificationMethod,transition.verificationReference]);
    await db.query('COMMIT');
    return {ok:true,traceId,status,verified:transition.verified};
   }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
  });
  if(result.missing)return res.status(404).json({error:'DIAGNOSTIC_NOT_FOUND'});
  if(result.invalid)return res.status(409).json({error:result.invalid});
  return res.status(200).json(result);
 }catch(e){
  console.error('MAINTENANCE_REPAIR_RECORD_FAILURE',String(e?.code||e?.name||'UNKNOWN').slice(0,40));
  return res.status(503).json({error:'MAINTENANCE_REPAIR_RECORD_UNAVAILABLE'});
 }
}
