import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../analysis-evaluation.js',import.meta.url),'utf8');
const {evaluateAnalysisFixture}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
const verified=quote=>({verification:{status:quote}});
const result={
 schema:'squidlaw-merged-analysis-v1',sourceReady:true,
 findings:[
  {title:'원고는 임대차기간 5년을 주장함',citationChecks:[verified('matched')]},
  {title:'피고는 임대차기간 2년을 주장함',citationChecks:[verified('matched')]}
 ]
};
const fixture={id:'lease-positions',requiredTerms:['원고','5년','피고','2년'],forbiddenTerms:['승소 확정','판결 완료']};
assert.equal(evaluateAnalysisFixture(result,fixture).passed,true);
const missing=evaluateAnalysisFixture(result,{...fixture,requiredTerms:['보증금 반환']});
assert.deepEqual(missing.missingRequired,['보증금 반환']);
assert.equal(missing.passed,false);
const fabricated=evaluateAnalysisFixture({...result,findings:[...result.findings,{title:'승소 확정',citationChecks:[verified('matched')]}]},fixture);
assert.deepEqual(fabricated.presentForbidden,['승소 확정']);
assert.equal(fabricated.passed,false);
const badCitation=evaluateAnalysisFixture({...result,findings:[{title:'원고 피고 5년 2년',citationChecks:[verified('unmatched')]}]},fixture);
assert.equal(badCitation.unverified,1);
assert.equal(badCitation.passed,false);
assert.equal(evaluateAnalysisFixture({...result,sourceReady:false},fixture).passed,false);
console.log('PASS: synthetic case quality gate catches missing positions, forbidden claims and unverified citations');
