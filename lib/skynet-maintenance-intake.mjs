import {buildMaintenancePlan,planDiagnosticRecovery} from './diagnostic-context.mjs';
/** Converts a sanitized diagnostic into an ordered, non-destructive maintenance work plan. */
export function createMaintenanceIntake({traceId,code,diagnostic}={}){
 if(!/^ERR-[0-9a-f-]{36}$/i.test(String(traceId||'')))throw Error('INVALID_MAINTENANCE_TRACE');
 if(!/^[A-Z][A-Z0-9_]{2,100}$/.test(String(code||'')))throw Error('INVALID_MAINTENANCE_CODE');
 const recovery=planDiagnosticRecovery(diagnostic);
 const plan=buildMaintenancePlan({diagnostic});
 const steps=[
  ['diagnosis','Confirm error source and trace lineage'],
  ['source_validation','Verify original evidence references and hashes'],
  ['implementation','Prepare reviewed minimal repair'],
  ['regression','Run targeted and integration tests'],
  ['deployment','Deploy with preflight and backup'],
  ['production_verification','Verify production behavior and restore readiness']
 ];
 return {traceId,code,kind:'maintenance',status:'planned',action:recovery.action,
  maintenancePlan:plan,requiresApproval:true,
  tasks:steps.map(([phase,description],index)=>({
   id:'maintenance-'+phase,kind:'maintenance',phase,description,
   status:'todo',dependsOn:index?[('maintenance-'+steps[index-1][0])]:[],
   priority:'P1',evidence:[]
  }))};
}
export function maintenanceNextAction(intake){
 if(!intake||intake.kind!=='maintenance')throw Error('INVALID_MAINTENANCE_INTAKE');
 const phase=intake.maintenancePlan?.nextPhase;
 if(!phase)return {status:'verification_required',reason:'ALL_PHASES_REPORTED_COMPLETE'};
 const task=intake.tasks?.find(t=>t.phase===phase);
 return {status:task?.status==='verified'?'checkpoint_required':'task_required',phase,taskId:task?.id||null};
}
