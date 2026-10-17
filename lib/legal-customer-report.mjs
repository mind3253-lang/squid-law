import {auditLegalReasoningResult} from './legal-reasoning-audit.mjs';
import {SOURCE_REVIEW_TASK} from './legal-source-read-audit.mjs';
const SHA=/^[a-f0-9]{64}$/;
export function buildLegalCustomerReport({request,windows,sourceIndex,independentAudit}){
 if(!request?.caseId||!SHA.test(request.sourceVersion||'')||!Array.isArray(windows)||!windows.length||!Array.isArray(sourceIndex))throw Error('INVALID_LEGAL_REPORT_INPUT');
 const findings=[],uncertainties=[],issues=[];let expected=0,reviewedUnits=0;
 const reviewedParts=new Set(),totalPages=new Set(sourceIndex.map(u=>u.documentId+':'+u.page));
 for(const [i,w] of windows.entries()){
  if(w.caseId!==request.caseId||w.sourceVersion!==request.sourceVersion||w.cursor!==expected||!Number.isSafeInteger(w.nextCursor)||w.nextCursor<=expected){issues.push('WINDOW_CONTINUITY:'+i);break}
  expected=w.nextCursor;
  if(w.sourceAudit?.complete!==true||w.verified!==false)issues.push('WINDOW_NOT_SOURCE_AUDITED:'+i);
  if(w.task===SOURCE_REVIEW_TASK){
   if(w.reviewAudit?.complete!==true||w.reviewAudit.totalUnits!==w.nextCursor-w.cursor||w.reviewAudit.reviewedUnits!==w.nextCursor-w.cursor||!Array.isArray(w.sourceReviewReceipts)||w.sourceReviewReceipts.length!==w.nextCursor-w.cursor)issues.push('SOURCE_READ_REVIEW_INCOMPLETE:'+i);
   else {reviewedUnits+=w.reviewAudit.reviewedUnits;for(const r of w.sourceReviewReceipts)reviewedParts.add(r.documentId+':'+r.page+':'+r.part)}
  }
  for(const f of w.findings||[])findings.push({...f,verificationStatus:'source_reference_checked_only'});
  for(const u of w.uncertainties||[])uncertainties.push(String(u));
 }
 if(windows.at(-1)?.complete!==true)issues.push('WINDOW_COVERAGE_INCOMPLETE');
 const totalPartsPerPage=new Map(),reviewedPartsPerPage=new Map();
 for(const u of sourceIndex){const page=u.documentId+':'+u.page;totalPartsPerPage.set(page,(totalPartsPerPage.get(page)||0)+1);if(reviewedParts.has(page+':'+u.part))reviewedPartsPerPage.set(page,(reviewedPartsPerPage.get(page)||0)+1)}
 const reviewedPages=[...totalPartsPerPage].filter(([page,count])=>reviewedPartsPerPage.get(page)===count).length;
 const readCoverage={task:windows[0]?.task||null,reviewedUnits,totalUnits:sourceIndex.length,reviewedPages,totalPages:totalPages.size,reviewMethod:'model_receipts_with_exact_source_quotes',complete:windows[0]?.task===SOURCE_REVIEW_TASK&&reviewedUnits===sourceIndex.length&&expected===sourceIndex.length&&issues.every(x=>!x.startsWith('SOURCE_READ_REVIEW_INCOMPLETE'))};
 if(windows[0]?.task===SOURCE_REVIEW_TASK&&!readCoverage.complete)issues.push('SOURCE_READ_COVERAGE_INCOMPLETE');
 const audit=auditLegalReasoningResult({request,result:{caseId:request.caseId,sourceVersion:request.sourceVersion,findings},sourceIndex});
 if(!audit.complete)issues.push(...audit.failures);
 const independentVerified=independentAudit?.verified===true&&independentAudit.sourceVersion===request.sourceVersion&&independentAudit.caseId===request.caseId;
 if(!independentVerified)issues.push('INDEPENDENT_SEMANTIC_AUDIT_PENDING');
 const ready=issues.length===0;
 return {caseId:request.caseId,sourceVersion:request.sourceVersion,reportType:'gpt_legal_analysis',clientRole:request.clientRole||null,title:'사건 법률 분석 보고서',status:ready?'reviewed':'draft_pending_verification',notForCourtSubmission:!ready,legalConclusionAvailable:ready,sourceReferenceAuditPassed:audit.complete,independentSemanticAuditPassed:independentVerified,sourceCoverage:{windows:windows.length,processedUnits:expected},sourceReviewCoverage:readCoverage,findings,uncertainties,issues,warning:ready?'원본과 독립 검증 결과를 확인한 후 제출 여부를 결정하세요.':'GPT 분석 초안입니다. 출처 일치 검사는 사실관계 및 법률적 타당성의 독립 검증을 대신하지 않습니다.'};
}
