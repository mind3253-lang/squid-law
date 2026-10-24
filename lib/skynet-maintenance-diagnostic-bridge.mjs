import {createMaintenanceIntake} from './skynet-maintenance-intake.mjs';
/** Pure, read-only bridge from the admin diagnostic API to an actionable plan. */
export function maintenanceIntakesFromDiagnostics(payload,{limit=20}={}){
 if(!payload||!Array.isArray(payload.records))throw Error('INVALID_DIAGNOSTICS_RESPONSE');
 if(payload.jobsStatus!=='available')return {status:'diagnostics_unavailable',intakes:[]};
 const seen=new Set(),intakes=[];
 for(const record of payload.records){
  if(intakes.length>=Math.max(1,Math.min(100,limit)))break;
  if(!record?.traceId||!record?.code||seen.has(record.traceId))continue;
  seen.add(record.traceId);
  try{
   const intake=createMaintenanceIntake({traceId:record.traceId,code:record.code,
    diagnostic:record.sourceDiagnostic||{reason:'UNKNOWN'}});
   intakes.push({...intake,sourceStage:String(record.stage||'').slice(0,80),
    lastObservedAt:record.updatedAt||null});
  }catch{continue}
 }
 return {status:'planned',intakes};
}

/**
 * Unified read-only error report. Never interprets a missing diagnostic source
 * as a healthy system; no customer evidence, tokens or raw checkpoints included.
 */
export function unifiedMaintenanceReport(payload,{limit=100}={}){
 if(!payload||!Array.isArray(payload.records)||!Array.isArray(payload.central))
  throw Error('INVALID_DIAGNOSTICS_RESPONSE');
 const cap=Math.max(1,Math.min(100,limit));
 const sources={jobs:payload.jobsStatus||'unavailable',central:payload.centralStatus||'unavailable'};
 const events=[];
 const clean=(value,max=100)=>String(value??'').replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,max);
 for(const r of payload.records.slice(0,cap)){
  if(!r?.code)continue;
  const missing=Array.isArray(r.gateDiagnostics?.missingGates)?r.gateDiagnostics.missingGates:[];
  events.push({origin:'analysis_job',code:clean(r.code),stage:clean(r.stage),status:clean(r.status),
   traceId:clean(r.traceId,60),observedAt:r.updatedAt||null,
   gates:{missing:missing.map(x=>clean(x,70)),ocrVerified:r.gateDiagnostics?.ocrVerified===true,
    boundariesVerified:r.gateDiagnostics?.boundariesVerified===true,
    textFailureCount:Number(r.gateDiagnostics?.textFailureCount)||0,
    boundaryFailureCount:Number(r.gateDiagnostics?.boundaryFailureCount)||0},
   recovery:'diagnose_before_repair'});
 }
 for(const r of payload.central.slice(0,cap)){
  if(!r?.code)continue;
  events.push({origin:'central',code:clean(r.code),stage:clean(r.stage),status:'recorded',
   traceId:clean(r.traceId,60),observedAt:r.time||null,recovery:'diagnose_before_repair'});
 }
 // A blocked job and its durable central event may share one trace ID.
 // Prefer the job entry because it carries completion-gate evidence.
 const byTrace=new Map();
 for(const e of events){
  const key=e.traceId||e.origin+'|'+e.code+'|'+e.observedAt;
  const old=byTrace.get(key);
  if(!old||e.origin==='analysis_job')byTrace.set(key,e);
 }
 events.length=0;
 events.push(...byTrace.values());
 const groups=new Map();
 for(const e of events){
  const k=e.code+'|'+e.stage;
  if(!groups.has(k))groups.set(k,{code:e.code,stage:e.stage,count:0,origins:[],missingGates:[]});
  const g=groups.get(k);g.count++;
  if(!g.origins.includes(e.origin))g.origins.push(e.origin);
  for(const gate of e.gates?.missing||[])if(!g.missingGates.includes(gate))g.missingGates.push(gate);
 }
 const complete=Object.values(sources).every(x=>x==='available');
 return {schemaVersion:1,generatedAt:new Date().toISOString(),
  status:complete?'report_ready':'partial_sources_unavailable',
  sources,totals:{events:events.length,groups:groups.size},
  groups:[...groups.values()],events,policy:{autoRepair:false,approvalRequired:true,
   preserveEvidence:true,checkpointMutation:false}};
}
