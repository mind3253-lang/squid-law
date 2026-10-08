import assert from 'node:assert/strict';
import {analyzeBatchWithModel} from '../analysis-model-worker.js';
import {validateBatchFindings} from '../analysis-batch-results.js';
import {assembleVerifiedCaseAnalysis} from '../analysis-case-report.js';
import {formatCaseReportText} from '../analysis-case-report-text.js';

const source='계약기간은 5년이며 변경합의는 별도로 체결하지 않았다.';
const batch={schema:'squidlaw-analysis-batch-v1',batch:1,pages:[{document:'계약서.pdf',page:1,text:source}]};
const finding={title:'계약기간 주장',analysis:'원고는 계약기간 5년을 주장하며 별도의 변경합의 여부가 쟁점이다.',claim:'원고는 5년을 주장',evidence:'계약기간은 5년',rebuttal:'',proofGap:'변경합의서 확인',citations:[{document:'계약서.pdf',page:1,quote:'계약기간은 5년이며'}]};
const payload={schema:'squidlaw-findings-v1',findings:[finding]};
let called=0;
const fetchImpl=async (url,init)=>{
 called++;
 assert.equal(url,'https://api.openai.com/v1/responses');
 const request=JSON.parse(init.body);
 assert.deepEqual(request.text.format.schema.properties.findings.items.required,['title','analysis','claim','evidence','rebuttal','proofGap','citations']);
 assert.equal(request.max_output_tokens,9000);
 return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]})};
};
const parsed=await analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-only',model:'gpt-4.1-mini',fetchImpl});
assert.equal(called,1);
assert.equal(parsed.findings[0].proofGap,'변경합의서 확인');
const checked=validateBatchFindings(batch,parsed);
assert.equal(checked.sourceReady,true);
const analysis={schema:'squidlaw-merged-analysis-v1',sourceReady:true,findings:checked.findings,diagnostics:{missingBatches:[]}};
const comparison={schema:'squidlaw-private-comparisons-v1',sourceReady:true,comparisons:[],diagnostics:{}};
const report=assembleVerifiedCaseAnalysis([{name:'계약서.pdf',pages:[{text:source}]}],analysis,comparison);
assert.equal(report.status,'source_checked');
assert.equal(report.diagnostics.comparisonNotPerformed,true);
assert.ok(report.notices.some(x=>x.includes('서면 비교를 수행하지 않았습니다')));
assert.equal(report.findings[0].claim,'원고는 5년을 주장');
assert.equal(report.findings[0].proofGap,'변경합의서 확인');
assert.match(formatCaseReportText(report),/추가 입증사항: 변경합의서 확인/);
assert.equal(report.diagnostics.submittedDocuments[0].pageCount,1);
assert.equal(report.diagnostics.readablePages,1);
assert.equal(report.diagnostics.unreadablePages,0);
assert.deepEqual(report.diagnostics.uncitedDocuments,[]);
const partial=assembleVerifiedCaseAnalysis([{name:'계약서.pdf',pages:[{text:source},{text:''}]},{name:'미인용.pdf',pages:[{text:'별도의 참고 자료'}]}],analysis,comparison);
assert.equal(partial.status,'source_checked_partial');
assert.equal(partial.diagnostics.totalPages,3);
assert.equal(partial.diagnostics.unreadablePages,1);
assert.equal(partial.diagnostics.citedReadablePages,1);
assert.equal(partial.diagnostics.verifiedPageCoveragePercent,50);
assert.equal(partial.diagnostics.totalPageCoveragePercent,33);
assert.equal(partial.diagnostics.uncitedReadablePages,1);
assert.deepEqual(partial.diagnostics.uncitedReadablePageDetails,[{document:'미인용.pdf',page:1}]);
assert.deepEqual(partial.diagnostics.uncitedDocuments,['미인용.pdf']);
assert.ok(partial.notices.some(x=>x.includes('식별되지 않은 페이지')));
assert.ok(partial.notices.some(x=>x.includes('원문 일치가 검증된 인용이 없는 파일')));
const lowCoverage=assembleVerifiedCaseAnalysis([{name:'계약서.pdf',pages:[{text:source},{text:'참고 2'},{text:'참고 3'},{text:'참고 4'},{text:'참고 5'}]}],analysis,comparison);
assert.equal(lowCoverage.diagnostics.verifiedPageCoveragePercent,20);
assert.ok(lowCoverage.notices.some(x=>x.includes('절반 미만')));
assert.match(formatCaseReportText(lowCoverage),/원문 일치 인용이 확인된 페이지가 절반 미만/);
const missingText=assembleVerifiedCaseAnalysis([{name:'계약서.pdf',pages:[{text:source},{},null,{text:42}]}],analysis,comparison);
assert.equal(missingText.diagnostics.totalPages,4);
assert.equal(missingText.diagnostics.readablePages,1);
assert.equal(missingText.diagnostics.unreadablePages,3);
assert.equal(missingText.status,'source_checked_partial');
assert.deepEqual(missingText.diagnostics.unreadableDetails.map(p=>p.page),[2,3,4]);
const unknown=assembleVerifiedCaseAnalysis([{name:'계약서.pdf',pages:[{text:source}]}],{...analysis,findings:[{...finding,citations:[{document:'존재하지않는.pdf',page:1,quote:'계약기간은 5년이며'}]}]},comparison);
assert.equal(unknown.status,'needs_source_review');
assert.deepEqual(unknown.diagnostics.unknownCitationDocuments,['존재하지않는.pdf']);
assert.ok(unknown.notices.some(x=>x.includes('제출되지 않은 PDF 파일명')));
assert.equal(unknown.diagnostics.verifiedCitationCount,0);
assert.equal(unknown.diagnostics.unverifiedCitationCount,1);
assert.match(formatCaseReportText(unknown),/제출 문서 목록에 없음: 존재하지않는.pdf/);
const partialText=formatCaseReportText(partial);
assert.match(partialText,/제출 문서 전체 페이지: 3쪽/);
assert.match(partialText,/텍스트 식별 가능 페이지: 2쪽/);
assert.match(partialText,/원문 일치가 검증된 식별 가능 페이지: 1쪽/);
assert.match(partialText,/원문 인용 검증 범위: 50%/);
assert.match(partialText,/제출된 전체 PDF 페이지 중 원문 인용 검증 범위: 33%/);
assert.match(partialText,/원문 일치가 검증된 인용이 없는 식별 가능 페이지: 1쪽/);
assert.match(partialText,/미인용.pdf: 1쪽/);
assert.ok(partialText.includes('원문 일치 인용이 없는 제출 문서 목록:')&&partialText.includes('  · 미인용.pdf'));
assert.match(partialText,/총 2페이지 중 2페이지는 내용을 식별할 수 없어/);
await assert.rejects(()=>analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-only',model:'gpt-4.1-mini',fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete',output:[]})})}),/MODEL_RESPONSE_INCOMPLETE/);
await assert.rejects(()=>analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-only',model:'gpt-4.1-mini',fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:{}})})}),/INVALID_MODEL_OUTPUT/);
for(const badResponse of [
 {ok:true},
 {ok:true,json:async()=>null},
 {ok:true,json:async()=>({status:'completed',output:[]})},
 {ok:true,json:async()=>({status:'completed',output:[null]})},
 {ok:true,json:async()=>({status:'completed',output:[{content:[null]}]})},
 {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:''}]}]})},
 {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]})}
]){
 await assert.rejects(()=>analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-only',model:'gpt-4.1-mini',fetchImpl:async()=>badResponse}),/INVALID_MODEL_RESPONSE|INVALID_MODEL_OUTPUT|MODEL_RESPONSE_NOT_COMPLETED/);
}
console.log('PASS: simulated model response flows through source verification and structured final report');
