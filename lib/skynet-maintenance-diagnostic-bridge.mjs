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
