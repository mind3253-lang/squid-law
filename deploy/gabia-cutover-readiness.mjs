// Explicit fail-closed decision for DNS cutover and Vercel retirement.
// Evidence flags must be supplied from real operator-observed tests, not inferred from commits.
const required=Object.freeze([
 'gabiaHttpsVerified','customerLoginVerified','customerUploadVerified',
 'databaseMigrationVerified','archiveIntegrityVerified','analysisE2eCompleted',
 'largePdfResumeVerified','multiUserIsolationVerified','backupRestoreVerified',
 'mobileDesktopVerified','rollbackDrillVerified'
]);
export function assessGabiaCutover(evidence={}){
 const missing=required.filter(key=>evidence[key]!==true);
 return {ready:missing.length===0,missing,dnsChangeAllowed:missing.length===0,
  vercelRetirementAllowed:false,reason:missing.length?'VERIFICATION_INCOMPLETE':'REQUIRES_POST_CUTOVER_MONITORING'};
}
export function assessVercelRetirement({cutoverEvidence={},productionMonitoringVerified=false,legacyDataAccessible=false,ownerApproved=false}={}){
 const cutover=assessGabiaCutover(cutoverEvidence);
 const missing=[...cutover.missing];
 if(!productionMonitoringVerified)missing.push('productionMonitoringVerified');
 if(!legacyDataAccessible)missing.push('legacyDataAccessible');
 if(!ownerApproved)missing.push('ownerApproved');
 return {allowed:missing.length===0,missing};
}
