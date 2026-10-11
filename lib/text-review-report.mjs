const cite=source=>({documentId:source?.documentId||null,page:Number.isSafeInteger(source?.page)?source.page:null,part:Number.isSafeInteger(source?.part)?source.part:null,hash:source?.hash||null});
export function buildTextReviewReport(aggregate){
 if(!aggregate||!aggregate.caseId||!/^[a-f0-9]{64}$/.test(aggregate.sourceVersion||'')||!Array.isArray(aggregate.coverage)||!aggregate.coverage.length||aggregate.verifiedLegal!==false||aggregate.verifiedVisual!==false)throw Error('INVALID_TEXT_REVIEW_REPORT_SOURCE');
 const candidates=aggregate.opposingStatementCandidates?.candidates||[];
 if(!Array.isArray(candidates)||!Array.isArray(aggregate.documentBoundaryCandidates)||!aggregate.claimRoleSummary)throw Error('INCOMPLETE_TEXT_REVIEW_REPORT_SOURCE');
 const conflicts=candidates.map((x,i)=>({id:i+1,status:'unverified_candidate',first:{text:x.first?.text||'',source:cite(x.first?.source)},second:{text:x.second?.text||'',source:cite(x.second?.source)},sharedTerms:x.sharedTerms||[]}));
 const references=(aggregate.crossDocumentEvidenceLinks||[]).map((x,i)=>({id:i+1,kind:x.kind,value:x.value,status:'unverified_related_evidence',sources:(x.references||[]).map(cite)}));
 return {caseId:aggregate.caseId,sourceVersion:aggregate.sourceVersion,title:'원문 검증 중간보고서',reportType:'text_review_only',status:'incomplete',notForCourtSubmission:true,legalConclusionAvailable:false,visualVerificationAvailable:false,sourceCoverage:aggregate.coverage,observationCount:aggregate.observationCount,claimRoleSummary:aggregate.claimRoleSummary,documentBoundaryCandidates:aggregate.documentBoundaryCandidates,opposingStatementCandidates:conflicts,crossDocumentEvidenceLinks:references,pending:['OCR 및 이미지 내용 검증','문서 분리의 의미적 검증','전체 사건 법률요건 분석','독립적인 재검증'],warning:'자동 추출된 미검증 후보이며 사실인정이나 법률적 결론이 아닙니다.'};
}
