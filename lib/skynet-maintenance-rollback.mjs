/** Plan rollback only for a known deployment and a verified backup. Never silently mutate production. */
export function planMaintenanceRollback({deployment,backup,health}={}){
 if(!deployment?.id||!deployment?.commit)return {allowed:false,reason:'DEPLOYMENT_IDENTITY_REQUIRED'};
 if(health?.status!=='failed')return {allowed:false,reason:'FAILURE_NOT_CONFIRMED'};
 if(!backup?.id||backup?.verified!==true||backup?.deploymentId!==deployment.id)
  return {allowed:false,reason:'VERIFIED_BACKUP_REQUIRED'};
 return {allowed:true,action:'gabia.rollback',deploymentId:deployment.id,backupId:backup.id,requiresApproval:true};
}
export function verifyRollback({plan,result}={}){
 if(!plan?.allowed||!result?.restored||result?.servicesActive!==true||result?.productionChecked!==true)
  return {complete:false,reason:'ROLLBACK_NOT_VERIFIED'};
 return {complete:true,reason:'ROLLBACK_VERIFIED'};
}
