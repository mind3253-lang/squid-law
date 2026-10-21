import {auditSourceUnitIndex} from './legal-reasoning-audit.mjs';
import {validateCompletionGates,REQUIRED_ANALYSIS_GATES} from './analysis-stage-gates.mjs';
const SHA=/^[a-f0-9]{64}$/;
export function reconcileAnalysisCompletion({sourceVersion,documents,sourceIndex,aggregate,report,visualReview,semanticAuditPassed,visualAudits,ocrVerified=false,boundariesVerified=false}){
 if(!SHA.test(sourceVersion||''))throw Error('COMPLETION_SOURCE_VERSION_INVALID');
 const failures=[];
 // OCR and boundary evidence must be supplied by separate verified audits; defaults are deliberately closed.
 const gate=(name,passed)=>({verified:passed===true,sourceVersion,evidence:name});
 let integrity=false,coverage=false;
 try{const r=auditSourceUnitIndex({documents,sources:sourceIndex?.sources});coverage=r.complete;integrity=sourceIndex?.sourceVersion===sourceVersion&&coverage}catch(e){failures.push(String(e.message||e))}
 const visual=visualReview?.verified===true&&visualReview.sourceVersion===sourceVersion&&Array.isArray(visualAudits)&&visualAudits.length===documents.length&&visualAudits.every(x=>x?.complete===true);
 const boundaryRows=aggregate?.documentBoundaryCandidates;
 const boundaryCoverage=Array.isArray(boundaryRows)&&boundaryRows.length===documents.length&&documents.every(d=>boundaryRows.some(b=>b.documentId===d.id&&b.coveredPages===d.pageCount&&Array.isArray(b.sections)));
 const legal=report?.sourceVersion===sourceVersion&&report?.sourceReferenceAuditPassed===true&&Array.isArray(report.findings)&&report.findings.length>0;
 const sourceRead=report?.sourceReviewCoverage?.complete===true&&report.sourceReviewCoverage.task==='claims_and_rebuttals'&&report.sourceReviewCoverage.reviewedUnits===sourceIndex?.sources?.length&&report.sourceReviewCoverage.totalUnits===sourceIndex?.sources?.length;
 const unresolved=Array.isArray(report?.issues)?report.issues.filter(x=>x!=='INDEPENDENT_SEMANTIC_AUDIT_PENDING'):['REPORT_ISSUES_MISSING'];
 const semantic=semanticAuditPassed===true&&legal&&unresolved.length===0;
 if(unresolved.length)failures.push(...unresolved.map(x=>'REPORT_UNRESOLVED:'+x));
 const gates={
  sourceIntegrity:gate('source-unit-index',integrity),
  textCoverage:gate('source-unit-index',coverage),
  sourceReadReview:gate('source-review-receipts',sourceRead),
  visualInventory:gate('visual-audit',visual),
  ocrCoverage:gate('ocr-verification',ocrVerified),
  visualVerification:gate('visual-audit',visual),
  documentBoundaries:gate('document-boundary-verification',boundariesVerified&&boundaryCoverage),
  caseStructure:gate('case-aggregate',aggregate?.sourceVersion===sourceVersion&&Array.isArray(aggregate?.documentBoundaryCandidates)&&boundaryCoverage),
  claimEvidenceReview:gate('legal-report-source-references',legal&&sourceRead&&unresolved.length===0),
  legalReasoning:gate('legal-report',legal),
  citationIntegrity:gate('source-citation-integrity',semantic)
 };
 const check=validateCompletionGates(gates);
 return {complete:check.complete&&failures.length===0,gates,missing:check.missing,failures};
}
