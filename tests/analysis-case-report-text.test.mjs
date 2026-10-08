import assert from 'node:assert/strict';
import {assembleCaseAnalysis} from '../analysis-case-report.js';
import {formatCaseReportText} from '../analysis-case-report-text.js';
const good={verification:{status:'matched'}};
const analysis={schema:'squidlaw-merged-analysis-v1',sourceReady:true,diagnostics:{},findings:[{
 title:'원고의 임대차기간 주장',citations:[{document:'원고.pdf',page:2,quote:'임대차기간은 5년이다'}],citationChecks:[good]
}]};
const comparison={schema:'squidlaw-private-comparisons-v1',sourceReady:true,diagnostics:{},comparisons:[{
 reference:'소갑 제3호증',relation:'different_positions',explanation:'계약기간 주장이 다르다',sourceReady:true,
 citations:[{document:'원고.pdf',page:2,quote:'임대차기간은 5년이다',verification:{status:'matched'}},{document:'피고.pdf',page:4,quote:'계약기간은 2년이다',verification:{status:'matched'}}]
}]};
const text=formatCaseReportText(assembleCaseAnalysis(analysis,comparison));
for(const term of ['원문 일치','원고.pdf · 2쪽','피고.pdf · 4쪽','임대차기간은 5년이다','계약기간은 2년이다','서로 다른 입장','진위'])assert.ok(text.includes(term),term);
assert.ok(!text.includes('[object Object]'));
const bad=formatCaseReportText(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citationChecks:[{verification:{status:'unmatched'}}]}]},comparison));
assert.match(bad,/출처 검산: 확인 필요/);
assert.match(bad,/원고.pdf · 2쪽 · 출처 확인 필요/);
assert.throws(()=>formatCaseReportText({}),/INVALID_CASE_REPORT/);
console.log('PASS: copyable Korean case report includes source page, quotes and mismatch warnings');

const missingCheckReport=assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citationChecks:[null]}]},comparison);
assert.match(formatCaseReportText(missingCheckReport),/원문 대조 필요/);
assert.throws(()=>formatCaseReportText({...missingCheckReport,findings:[null]}),/INVALID_CASE_REPORT_ENTRY/);
assert.throws(()=>formatCaseReportText({...missingCheckReport,comparisons:[{...comparison.comparisons[0],citations:[null]}]}),/INVALID_CASE_REPORT_ENTRY/);

const forged=assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{document:'원고.pdf',page:2,quote:'짧음'}]}]},comparison);
const forgedText=formatCaseReportText(forged);
assert.match(forgedText,/출처 검산: 확인 필요/);
assert.match(forgedText,/원문 대조 필요/);
assert.match(forgedText,/원문 확인 필요 인용: 1건/);

assert.match(forgedText,/원고.pdf · 2쪽 · 출처 확인 필요/);
const forgedComparison=assembleCaseAnalysis(analysis,{...comparison,comparisons:[{...comparison.comparisons[0],citations:[{...comparison.comparisons[0].citations[0],quote:'짧음'},comparison.comparisons[0].citations[1]]}]});
const comparisonText=formatCaseReportText(forgedComparison);
assert.match(comparisonText,/출처 확인이 필요한 비교 후보: 1건/);
assert.match(comparisonText,/원고.pdf · 2쪽 · 출처 확인 필요/);

const spoofedReport={...forged,status:'source_checked',diagnostics:{...forged.diagnostics,analysisSourceReady:true,comparisonSourceReady:true}};
assert.match(formatCaseReportText(spoofedReport),/출처 검산: 확인 필요/);
assert.match(formatCaseReportText(spoofedReport),/출처 검산 상태: 추가 확인 필요/);

const malformedSubmitted={...assembleCaseAnalysis(analysis,comparison),diagnostics:{...assembleCaseAnalysis(analysis,comparison).diagnostics,submittedDocuments:[null,{name:'원고.pdf',pageCount:2}],uncitedDocuments:['원고.pdf']}};
assert.match(formatCaseReportText(malformedSubmitted),/문서 미상/);
assert.match(formatCaseReportText(malformedSubmitted),/원문 일치 인용이 없는 제출 문서: 2개/);

const paddedReport=assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{document:'원고.pdf',page:1,quote:'가          나'}]}]},comparison);
assert.match(formatCaseReportText(paddedReport),/원문 확인 필요 인용: 1건/);
