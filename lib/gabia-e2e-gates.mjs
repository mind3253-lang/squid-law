// Stage 11: static readiness gates; no live server or paid AI calls.
export function assessGabiaE2E(evidence){
 const required=['eightPagePdf','largePdfResume','concurrentCustomers','tenantIsolation','mobileLogin','billingReconcile','backupRestore'];
 if(!evidence||typeof evidence!=='object')throw Error('INVALID_E2E_EVIDENCE');
 const missing=required.filter(key=>evidence[key]!==true);
 return {passed:missing.length===0,missing,checked:required.length};
}
export function assessPdfRun(run){
 if(!run||typeof run!=='object')return {passed:false,reason:'MISSING_RUN'};
 if(run.status!=='completed'||run.resultVerified!==true||run.originalSha256Verified!==true||run.pagesVerified!==run.pagesExpected)return {passed:false,reason:'PDF_NOT_VERIFIED'};
 return {passed:true,reason:null};
}
