import {createHash} from 'node:crypto';
import {createMaintenanceIntake} from './skynet-maintenance-intake.mjs';
import {validatePlan} from './skynet-job-plan.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
/** Deterministic ID makes repeated ingestion idempotent at the atomic database insert. */
export function maintenanceJobFromDiagnostic({traceId,code,diagnostic}={}){
 const intake=createMaintenanceIntake({traceId,code,diagnostic});
 const id='maint-'+createHash('sha256').update(traceId).digest('hex').slice(0,40);
 const now=new Date().toISOString();
 return appendJobEvent({id,title:'Maintenance '+code,
  instructions:'Investigate diagnostic '+traceId+'. Verify provenance before any repair; require explicit approval for production changes.',
  kind:'maintenance',diagnosticTraceId:traceId,diagnosticCode:code,
  maintenancePlan:intake.maintenancePlan,maintenanceVerification:null,
  tasks:validatePlan(intake.tasks),scopes:['repository:read','deployment:read'],
  writeTargets:{},status:'queued',owner:null,checkpoint:null,createdAt:now,
  requiresApproval:true},'maintenance-created',{traceId,code});
}
