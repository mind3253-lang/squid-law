import assert from 'node:assert/strict';
import {assembleVerifiedCaseAnalysis} from '../analysis-case-report.js';
const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 계약기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 계약기간 2년을 주장한다.'}]}
];
const citation={document:'원고.pdf',page:1,quote:'계약기간 5년을 주장한다'};
const defense={document:'피고.pdf',page:1,quote:'계약기간 2년을 주장한다'};
const analysis={schema:'squidlaw-merged-analysis-v1',sourceReady:true,diagnostics:{},findings:[{
 title:'기간 주장',citations:[citation],citationChecks:[{verification:{status:'matched'}}]
}]};
const comparison={schema:'squidlaw-private-comparisons-v1',sourceReady:true,diagnostics:{},comparisons:[{
 relation:'different_positions',reference:'소갑 제3호증',explanation:'서로 다른 기간 주장',
 sourceReady:true,citations:[{...citation,verification:{status:'matched'}},{...defense,verification:{status:'matched'}}]
}]};
const good=assembleVerifiedCaseAnalysis(documents,analysis,comparison);
assert.equal(good.status,'source_checked');
assert.equal(good.findings[0].citationChecks[0].verification.status,'matched');
const forged={...analysis,findings:[{...analysis.findings[0],citations:[{...citation,quote:'원문에 없는 계약기간 9년'}]}]};
const rejected=assembleVerifiedCaseAnalysis(documents,forged,comparison);
assert.equal(rejected.status,'needs_source_review');
assert.equal(rejected.findings[0].citationChecks[0].verification.status,'unmatched');
const forgedComparison={...comparison,comparisons:[{...comparison.comparisons[0],citations:[{...citation,verification:{status:'matched'}},{...defense,quote:'피고는 계약기간 8년을 주장한다',verification:{status:'matched'}}]}]};
assert.equal(assembleVerifiedCaseAnalysis(documents,analysis,forgedComparison).status,'needs_source_review');
const empty=assembleVerifiedCaseAnalysis(documents,{...analysis,findings:[]},comparison);
assert.equal(empty.status,'needs_source_review');
assert.equal(empty.diagnostics.analysisSourceReady,false);
console.log('PASS: final report rechecks all original quotes, rejects forged statuses and empty findings');
