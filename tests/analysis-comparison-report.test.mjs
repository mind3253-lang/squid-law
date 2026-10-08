import assert from 'node:assert/strict';
import {buildVerifiedComparisonReport} from '../analysis-comparison-report.js';
const docs=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 계약기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증을 근거로 계약기간 2년을 주장한다.'}]}
];
const result=buildVerifiedComparisonReport(docs);
assert.equal(result.kind,'reference-co-mentions-not-contradictions');
assert.equal(result.diagnostics.total,1);
assert.equal(result.diagnostics.sourceMatched,1);
assert.equal(result.diagnostics.needsReview,0);
assert.equal(result.leads[0].sourceReady,true);
assert.deepEqual(result.leads[0].checks.map(c=>c.verification.status),['matched','matched']);
assert.equal(buildVerifiedComparisonReport([{name:'원고.pdf',pages:[{text:'소갑 제3호증'}]}]).diagnostics.total,0);
console.log('PASS: comparison report verifies both source quotes and does not label co-mentions as contradictions');
