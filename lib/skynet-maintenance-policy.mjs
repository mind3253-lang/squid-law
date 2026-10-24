/**
 * SKYNET maintenance policy. Repair status is independent of analysis-job status.
 * This module never mutates customer evidence, payment records or checkpoints.
 */
const STATUSES=new Set(['pending','diagnosing','repairing','verifying','verified','failed','reopened']);
const LEVELS=new Set(['critical','warning','normal']);
const clean=(s,n=120)=>String(s??'').replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,n);
export function maintenanceSeverity(code,stage=''){
 const key=(String(code)+' '+String(stage)).toUpperCase();
 if(/PAYMENT|BILLING|DATA_LOSS|INTEGRITY|SOURCE_MISMATCH|CORRUPTION|SECURITY|UNAUTHORIZED/.test(key))return 'critical';
 if(/PDF|OCR|BOUNDARY|MODEL|OPENAI|QUEUE|DATABASE|COMPLETION|WORKER|TIMEOUT/.test(key))return 'warning';
 return 'normal';
}
export function maintenanceFingerprint(event){
 if(!event?.code)throw Error('MAINTENANCE_CODE_REQUIRED');
 return clean(event.code,100)+'|'+clean(event.stage,80);
}
export function verifyRepairTransition(previous,next,{verificationReference,verificationMethod}={}){
 if(!STATUSES.has(next))throw Error('INVALID_REPAIR_STATUS');
 const current=previous||'pending';
 if(!STATUSES.has(current))throw Error('INVALID_PREVIOUS_REPAIR_STATUS');
 const allowed={
  pending:['diagnosing','repairing','failed'],diagnosing:['repairing','failed'],
  repairing:['verifying','failed'],verifying:['verified','failed'],
  verified:['reopened'],failed:['diagnosing','repairing'],reopened:['diagnosing','repairing']
 };
 if(!allowed[current].includes(next))throw Error('INVALID_REPAIR_TRANSITION');
 if(next==='verified'&&(!verificationReference||!verificationMethod))throw Error('REPAIR_VERIFICATION_EVIDENCE_REQUIRED');
 return {status:next,verified:next==='verified',verificationReference:next==='verified'?clean(verificationReference,160):null,
  verificationMethod:next==='verified'?clean(verificationMethod,80):null};
}
export function maintenanceReportWithRepairs(report,repairs=[]){
 if(!report||!Array.isArray(report.events)||!Array.isArray(repairs))throw Error('INVALID_MAINTENANCE_REPORT');
 const byTrace=new Map(repairs.filter(r=>r?.traceId).map(r=>[r.traceId,r]));
 const events=report.events.map(e=>{
  const repair=byTrace.get(e.traceId);
  const status=STATUSES.has(repair?.status)?repair.status:'pending';
  return {...e,severity:maintenanceSeverity(e.code,e.stage),repair:{
   status,verified:status==='verified'&&Boolean(repair?.verificationReference&&repair?.verificationMethod),
   verifiedAt:repair?.verifiedAt||null,verificationMethod:repair?.verificationMethod||null}};
 });
 const grouped=new Map();
 for(const e of events){
  const fingerprint=maintenanceFingerprint(e);
  if(!grouped.has(fingerprint))grouped.set(fingerprint,{fingerprint,code:e.code,stage:e.stage,
   severity:e.severity,count:0,firstObservedAt:e.observedAt,lastObservedAt:e.observedAt,
   repairStatus:'pending',traceIds:[]});
  const g=grouped.get(fingerprint);g.count++;g.traceIds.push(e.traceId);
  if(e.observedAt&&(!g.firstObservedAt||e.observedAt<g.firstObservedAt))g.firstObservedAt=e.observedAt;
  if(e.observedAt&&(!g.lastObservedAt||e.observedAt>g.lastObservedAt)){g.lastObservedAt=e.observedAt;g.repairStatus=e.repair.status}
 }
 const groups=[...grouped.values()].sort((a,b)=>String(b.lastObservedAt||'').localeCompare(String(a.lastObservedAt||'')));
 return {...report,events:events.sort((a,b)=>String(b.observedAt||'').localeCompare(String(a.observedAt||''))),
  groups,totals:{...report.totals,events:events.length,groups:groups.length},
  monitor:{status:report.status==='report_ready'?'online':'degraded',repairAutomation:'disabled',
   independentMonitorRequired:true},repairPolicy:{verifiedOnlyWithEvidence:true,
   noAutomaticCustomerDataChanges:true,noAutomaticPaymentChanges:true,rollbackOnRegression:true}};
}
