import {auditSourceUnitIndex} from './legal-reasoning-audit.mjs';
import {validateCompletionGates} from './analysis-stage-gates.mjs';
const SHA=/^[a-f0-9]{64}$/;
export function reconcileAnalysisCompletion({sourceVersion,documents,sourceIndex,aggregate,report,visualReview,semanticAuditPassed,visualAudits,ocrVerified=false,boundariesVerified=false,verifiedBoundaries=null}){
 if(!SHA.test(sourceVersion||''))throw Error('COMPLETION_SOURCE_VERSION_INVALID');
 const failures=[];
 // OCR and boundary evidence must be supplied by separate verified audits; defaults are deliberately closed.
 const gate=(name,passed)=>({verified:passed===true,sourceVersion,evidence:name});
 let integrity=false,coverage=false;
 try{const r=auditSourceUnitIndex({documents,sources:sourceIndex?.sources});coverage=r.complete;integrity=sourceIndex?.sourceVersion===sourceVersion&&coverage}catch(e){failures.push(String(e.message||e))}
 const visual=visualReview?.verified===true&&visualReview.sourceVersion===sourceVersion&&Array.isArray(visualAudits)&&visualAudits.length===documents.length&&visualAudits.every(x=>x?.complete===true);
 // Prefer independently verified boundary receipts over preliminary candidates.
 const boundaryRows=verifiedBoundaries??aggregate?.documentBoundaryCandidates;
 const boundaryCoverage=Array.isArray(boundaryRows)&&boundaryRows.length===documents.length&&documents.every(d=>boundaryRows.some(b=>b.documentId===d.id&&b.coveredPages===d.pageCount&&Array.isArray(b.sections)));
 const documentSourceVerified=integrity;
 const legal=report?.sourceVersion===sourceVersion&&Array.isArray(report?.findings);
 const sourceRead=report?.sourceReviewCoverage?.complete===true&&report.sourceReviewCoverage.task==='claims_and_rebuttals'&&report.sourceReviewCoverage.reviewedUnits===sourceIndex?.sources?.length&&report.sourceReviewCoverage.totalUnits===sourceIndex?.sources?.length;
 const semantic=semanticAuditPassed===true&&legal;
 // Legal uncertainties remain visible in the draft report.
 const gates={
  sourceIntegrity:gate('source-unit-index',documentSourceVerified),
  textCoverage:gate('source-unit-index',documentSourceVerified),
  sourceReadReview:gate('source-window-coverage',sourceRead),
  visualInventory:gate('visual-audit',visual),
  ocrCoverage:gate('ocr-verification',ocrVerified),
  visualVerification:gate('visual-audit',visual),
  documentBoundaries:gate('document-boundary-verification',boundariesVerified&&boundaryCoverage),
  caseStructure:gate('case-aggregate',aggregate?.sourceVersion===sourceVersion&&boundariesVerified&&boundaryCoverage),
  claimEvidenceReview:gate('legal-report-draft',legal&&sourceRead),
  legalReasoning:gate('legal-report',legal),
  citationIntegrity:gate('source-citation-integrity',semantic)
 };
 const check=validateCompletionGates(gates);
 const gateReasons={
  sourceIntegrity:!coverage?'SOURCE_INDEX_COVERAGE_INCOMPLETE':'SOURCE_INDEX_VERSION_MISMATCH',
  textCoverage:'SOURCE_INDEX_COVERAGE_INCOMPLETE',
  sourceReadReview:!report?.sourceReviewCoverage?.complete?'SOURCE_REVIEW_INCOMPLETE':'SOURCE_REVIEW_UNIT_COUNT_MISMATCH',
  visualInventory:'VISUAL_REVIEW_OR_DOCUMENT_AUDIT_INCOMPLETE',
  ocrCoverage:'VERIFIED_OCR_RECEIPTS_INCOMPLETE',
  visualVerification:'VISUAL_REVIEW_OR_DOCUMENT_AUDIT_INCOMPLETE',
  documentBoundaries:!boundariesVerified?'BOUNDARY_RECEIPTS_INCOMPLETE':'BOUNDARY_COVERAGE_INCOMPLETE',
  caseStructure:!boundaryCoverage?'CASE_BOUNDARY_COVERAGE_INCOMPLETE':'CASE_AGGREGATE_VERSION_MISMATCH',
  claimEvidenceReview:!legal?'LEGAL_REPORT_VERSION_OR_FINDINGS_MISSING':'SOURCE_REVIEW_INCOMPLETE',
  legalReasoning:'LEGAL_REPORT_VERSION_OR_FINDINGS_MISSING',
  citationIntegrity:'SEMANTIC_AUDIT_OR_REPORT_INCOMPLETE',
  SOURCE_VERSION_MISMATCH:'GATE_SOURCE_VERSIONS_DIFFER'
 };
 return {complete:check.complete&&failures.length===0,gates,missing:check.missing,gateReasons:Object.fromEntries(check.missing.map(key=>[key,gateReasons[key]||'UNKNOWN_GATE_FAILURE'])),failures};
}
