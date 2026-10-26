import {aggregateModelUsage} from './model-usage-observability.mjs';
import {auditLegalReasoningResult} from './legal-reasoning-audit.mjs';
import {auditLegalAuthorities} from './legal-authority-audit.mjs';
import {SOURCE_REVIEW_TASK} from './legal-source-read-audit.mjs';
const SHA=/^[a-f0-9]{64}$/;
// Merge repeated findings from successive source windows while retaining every citation.
const normalizedIssue=value=>String(value||'').normalize('NFKC').replace(/[\\s_\\-·:]+/g,'').toLowerCase();
const normalizedText=value=>String(value||'').normalize('NFKC').replace(/\\s+/g,' ').trim();
function consolidateLegalFindings(rows){
 const result=[],seen=new Map();
 for(const finding of rows){
  const key=normalizedIssue(finding.issueKey);
  const signature=key||normalizedText(finding.claim).slice(0,140);
  const existing=seen.get(signature);
  if(!existing){const copy={...finding,sources:[...(finding.sources||[])]};result.push(copy);seen.set(signature,copy);continue;}
  const citations=new Set((existing.sources||[]).map(x=>[x.documentId,x.page,x.part,x.hash].join(':')));
  for(const ref of finding.sources||[]){
   const id=[ref.documentId,ref.page,ref.part,ref.hash].join(':');
   if(!citations.has(id)){existing.sources.push(ref);citations.add(id);}
  }
  for(const field of ['plaintiffPosition','defendantPosition','contradiction','analysis','legalImpact','evidenceNeed']){
   const incoming=normalizedText(finding[field]),current=normalizedText(existing[field]);
   if(incoming&&!current)existing[field]=finding[field];
   else if(incoming&&current&&incoming!==current&&!current.includes(incoming)&&!incoming.includes(current)){
    // Distinct evidence or reasoning must not be lost merely to shorten output.
    existing[field]=current+' / '+incoming;
   }
  }
  if(Array.isArray(finding.legalSearchKeywords))
   existing.legalSearchKeywords=[...new Set([...(existing.legalSearchKeywords||[]),...finding.legalSearchKeywords])].slice(0,6);
 }
 return result;
}
export function buildLegalCustomerReport({request,windows,sourceIndex,independentAudit}){
 if(!request?.caseId||!SHA.test(request.sourceVersion||'')||!Array.isArray(windows)||!windows.length||!Array.isArray(sourceIndex))throw Error('INVALID_LEGAL_REPORT_INPUT');
 const findings=[],uncertainties=[],issues=[];let expected=0,reviewedUnits=0;
 const reviewedParts=new Set(),totalPages=new Set(sourceIndex.map(u=>u.documentId+':'+u.page));
 for(const [i,w] of windows.entries()){
  if(w.caseId!==request.caseId||w.sourceVersion!==request.sourceVersion||w.cursor!==expected||!Number.isSafeInteger(w.nextCursor)||w.nextCursor<=expected){issues.push('WINDOW_CONTINUITY:'+i);break}
  expected=w.nextCursor;
  if(w.sourceAudit?.complete!==true||w.verified!==false)issues.push('WINDOW_NOT_SOURCE_AUDITED:'+i);
  if(w.task===SOURCE_REVIEW_TASK){
   // Coverage is deterministic: every contiguous source unit was supplied to the
   // reasoning window. Do not require AI-generated per-page quotation receipts.
   const count=w.nextCursor-w.cursor;
   reviewedUnits+=count;
   for(const u of sourceIndex.slice(w.cursor,w.nextCursor))reviewedParts.add(u.documentId+':'+u.page+':'+u.part);
  }
  for(const f of w.findings||[])findings.push({...f,verificationStatus:'source_reference_checked_only'});
  for(const u of w.uncertainties||[])uncertainties.push(String(u));
 }
 if(windows.at(-1)?.complete!==true)issues.push('WINDOW_COVERAGE_INCOMPLETE');
 const totalPartsPerPage=new Map(),reviewedPartsPerPage=new Map();
 for(const u of sourceIndex){const page=u.documentId+':'+u.page;totalPartsPerPage.set(page,(totalPartsPerPage.get(page)||0)+1);if(reviewedParts.has(page+':'+u.part))reviewedPartsPerPage.set(page,(reviewedPartsPerPage.get(page)||0)+1)}
 const reviewedPages=[...totalPartsPerPage].filter(([page,count])=>reviewedPartsPerPage.get(page)===count).length;
 const readCoverage={task:windows[0]?.task||null,reviewedUnits,totalUnits:sourceIndex.length,reviewedPages,totalPages:totalPages.size,reviewMethod:'deterministic_source_window_coverage_not_semantic_verification',complete:windows[0]?.task===SOURCE_REVIEW_TASK&&reviewedUnits===sourceIndex.length&&expected===sourceIndex.length&&issues.every(x=>!x.startsWith('SOURCE_READ_REVIEW_INCOMPLETE'))};
 if(windows[0]?.task===SOURCE_REVIEW_TASK&&!readCoverage.complete)issues.push('SOURCE_READ_COVERAGE_INCOMPLETE');
 const consolidatedFindings=consolidateLegalFindings(findings);
 const audit=auditLegalReasoningResult({request,result:{caseId:request.caseId,sourceVersion:request.sourceVersion,findings:consolidatedFindings},sourceIndex});
 // Baseline output remains available; unresolved citation checks are warnings.
 // Prefer legal conclusions/elements over incidental factual mentions. Keep three
 // relevant claim-element search axes for the precedent and drafting pipeline.
 const keywordVotes=new Map();
 for(const finding of consolidatedFindings){
  const weight=finding.type==='legal_conclusion'?4:finding.type==='legal_element'?3:finding.type==='claim'||finding.type==='counterclaim'?2:1;
  for(const raw of Array.isArray(finding.legalSearchKeywords)?finding.legalSearchKeywords:[]){
   if(typeof raw!=='string')continue;
   const word=raw.replace(/^#+/,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
   if(word.length<4||word.length>65||!/[가-힣]/.test(word))continue;
   const key=word.replace(/\s+/g,'').toLowerCase();
   const current=keywordVotes.get(key);
   keywordVotes.set(key,{word,score:(current?.score||0)+weight});
  }
 }
 const legalSearchKeywords=[...keywordVotes.values()].sort((a,b)=>b.score-a.score).map(x=>x.word);
 const authorityAudit=auditLegalAuthorities(consolidatedFindings);
 // Stage 3: run legal-authority checks for every report without blocking
 // baseline analysis. A cited case number is not proof of an externally
 // verified holding; keep unverified references in a separate audit record.
 if(!authorityAudit.complete)console.warn('LEGAL_AUTHORITY_STAGE3',JSON.stringify({count:authorityAudit.issues.length,issues:authorityAudit.issues.slice(0,20)}));
 // Authority verification is advisory until a separate review completes.
 const independentVerified=independentAudit?.verified===true&&independentAudit.sourceVersion===request.sourceVersion&&independentAudit.caseId===request.caseId;
 // Citation matching alone cannot authorize a final legal report.
 if(!readCoverage.complete)issues.push('SOURCE_READ_COVERAGE_INCOMPLETE');
 if(!independentVerified)issues.push('INDEPENDENT_SEMANTIC_AUDIT_PENDING');
 const ready=issues.length===0;
 return {caseId:request.caseId,sourceVersion:request.sourceVersion,reportType:'gpt_legal_analysis',analysisEngineVersion:'gpt-6-claims-v1',clientRole:request.clientRole||null,title:'사건 법률 분석 보고서',status:ready?'reviewed':'draft_pending_verification',notForCourtSubmission:!ready,legalConclusionAvailable:ready,sourceReferenceAuditPassed:audit.complete,legalAuthorityAudit:authorityAudit,independentSemanticAuditPassed:false,sourceCoverage:{windows:windows.length,processedUnits:expected},sourceReviewCoverage:readCoverage,legalSearchKeywords,modelUsage:aggregateModelUsage(windows.map(w=>w.modelUsage).filter(Boolean)),findings:consolidatedFindings,uncertainties:[...new Set(uncertainties)],issues,warning:ready?'원본과 독립 검증 결과를 확인한 후 제출 여부를 결정하세요.':'GPT 분석 초안입니다. 출처 일치 검사는 사실관계 및 법률적 타당성의 독립 검증을 대신하지 않습니다.'};
}
