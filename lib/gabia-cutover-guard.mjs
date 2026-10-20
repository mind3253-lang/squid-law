// Read-only deployment readiness assessment; no service activation.
export function gabiaCutoverReadiness(checks){
 const required=['databaseMigrated','filesReconciled','authVerified','workerVerified','paymentsVerified','backupRestoreVerified','rollbackReady'];
 if(!checks||typeof checks!=='object')throw Error('INVALID_CUTOVER_CHECKS');
 const missing=required.filter(key=>checks[key]!==true);
 return {ready:missing.length===0,missing};
}
export function gabiaServiceExposure({host,approved=false}){
 return approved===true&&(host==='127.0.0.1'||host==='::1');
}
