import assert from 'node:assert/strict';
import {prepareAnalysisInput} from '../analysis-input.js';
import {batchAnalysisInput} from '../analysis-batches.js';
import {validateBatchFindings} from '../analysis-batch-results.js';
import {mergeCheckedBatches} from '../analysis-merge.js';
import {assembleVerifiedCaseAnalysis} from '../analysis-case-report.js';
import {formatCaseReportText} from '../analysis-case-report-text.js';

const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 임대차기간이 5년이라고 주장한다.'},{text:''}]},
 {name:'피고.pdf',pages:[{text:'피고는 임대차기간이 2년이라고 주장한다.'}]}
];
const input=prepareAnalysisInput(documents);
const batches=batchAnalysisInput(input,{maxBatchPages:1});
assert.equal(batches.batches.length,2);
const findings=batches.batches.map(b=>{
 const p=b.pages[0];
 const quote=p.text.slice(p.text.indexOf('임대차기간'));
 return validateBatchFindings(b,{schema:'squidlaw-findings-v1',findings:[{title:'계약기간',citations:[{document:p.document,page:p.page,quote}]}]});
});
assert.ok(findings.every(f=>f.sourceReady));
const merged=mergeCheckedBatches(batches,findings);
assert.equal(merged.sourceReady,true);
const noComparisons={schema:'squidlaw-private-comparisons-v1',sourceReady:true,diagnostics:{},comparisons:[]};
const report=assembleVerifiedCaseAnalysis(documents,merged,noComparisons);
assert.equal(report.status,'source_checked_partial');
assert.equal(report.diagnostics.verifiedCitationCount,2);
assert.equal(report.diagnostics.readablePages,2);
assert.equal(report.diagnostics.unreadablePages,1);
assert.match(formatCaseReportText(report),/출처 검산: 일부 페이지 미식별/);

const missing=mergeCheckedBatches(batches,[findings[0]]);
assert.equal(missing.sourceReady,false);
assert.deepEqual(missing.diagnostics.missingBatches,[2]);
const missingReport=assembleVerifiedCaseAnalysis(documents,missing,noComparisons);
assert.equal(missingReport.status,'needs_source_review');
assert.match(formatCaseReportText(missingReport),/결과가 누락된 분석 묶음: 2/);

const forged=structuredClone(merged);
forged.findings[0].citations[0].quote='원문에 없는 임대차기간 9년 주장';
forged.findings[0].citationChecks[0].verification.status='matched';
const checked=assembleVerifiedCaseAnalysis(documents,forged,noComparisons);
assert.equal(checked.status,'needs_source_review');
assert.equal(checked.diagnostics.unverifiedCitationCount,1);
assert.match(formatCaseReportText(checked),/출처 검산: 확인 필요/);
console.log('PASS: input → batches → citation checks → merge → final source recheck → Korean report');
