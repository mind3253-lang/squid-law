/** Fail-closed gate for representing a report as court-submission-ready. */
export function courtSubmissionGate(report){
 const missing=[];
 if(!report||report.status!=='reviewed')missing.push('REPORT_NOT_REVIEWED');
 if(report?.notForCourtSubmission!==false)missing.push('REPORT_MARKED_DRAFT');
 if(report?.independentSemanticAuditPassed!==true)missing.push('SEMANTIC_AUDIT_MISSING');
 if(report?.sourceReferenceAuditPassed!==true)missing.push('SOURCE_AUDIT_MISSING');
 if(report?.legalAuthorityAudit?.complete!==true)missing.push('AUTHORITY_AUDIT_MISSING');
 if(!Array.isArray(report?.findings)||report.findings.length===0)missing.push('FINDINGS_MISSING');
 if(Array.isArray(report?.issues)&&report.issues.length)missing.push('UNRESOLVED_REPORT_ISSUES');
 return {allowed:missing.length===0,missing};
}
