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
