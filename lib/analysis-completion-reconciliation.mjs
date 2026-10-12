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
 const visual=visualReview?.verified===true&&visualReview?.independentAuditVerified===true&&visualReview.sourceVersion===sourceVersion&&Array.isArray(visualAudits)&&visualAudits.length===documents.length&&visualAudits.every(x=>x?.complete===true);
 const legal=report?.sourceVersion===sourceVersion&&report?.sourceReferenceAuditPassed===true&&Array.isArray(report.findings)&&report.findings.length>0;
 const semantic=semanticAuditPassed===true&&legal;
 const gates={
  sourceIntegrity:gate('source-unit-index',integrity),
  textCoverage:gate('source-unit-index',coverage),
  visualInventory:gate('visual-audit',visual),
  ocrCoverage:gate('ocr-verification',ocrVerified),
  visualVerification:gate('visual-audit',visual),
  documentBoundaries:gate('document-boundary-verification',boundariesVerified),
  caseStructure:gate('case-aggregate',aggregate?.sourceVersion===sourceVersion&&Array.isArray(aggregate?.documentBoundaryCandidates)&&aggregate.documentBoundaryCandidates.length===documents.length),
  claimEvidenceReview:gate('legal-report-source-references',legal),
  legalReasoning:gate('legal-report',legal),
  independentSemanticAudit:gate('semantic-audit',semantic)
 };
 const check=validateCompletionGates(gates);
 return {complete:check.complete,gates,missing:check.missing,failures};
}
