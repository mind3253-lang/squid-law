// Customer reports must remain marked as drafts until independent verification.
export function gabiaReportAccess(report){
 if(!report||typeof report!=='object')return {ready:false,reason:'REPORT_MISSING'};
 if(report.status!=='reviewed'||report.independentSemanticAuditPassed!==true||report.notForCourtSubmission===true)
  return {ready:false,reason:'REPORT_NOT_VERIFIED'};
 if(!Array.isArray(report.findings))return {ready:false,reason:'REPORT_INVALID'};
 return {ready:true,reason:null};
}
