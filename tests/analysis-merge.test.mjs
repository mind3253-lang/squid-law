import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../analysis-merge.js',import.meta.url),'utf8');
const {mergeCheckedBatches}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const expected={schema:'squidlaw-analysis-batches-v1',batches:[{batch:1},{batch:2}]};
const citation={verification:{status:'matched'}};
const result=(batch,sourceReady=true,checks=[citation])=>({schema:'squidlaw-checked-batch-v1',batch,sourceReady,quality:{matched:1},findings:[{title:'분석 후보 '+batch,citations:[{document:'test.pdf',page:1,quote:'원문 인용 8자 이상'}],citationChecks:checks}]});
const complete=mergeCheckedBatches(expected,[result(2),result(1)]);
assert.equal(complete.sourceReady,true);
const incompleteChecks=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[{...result(2).findings[0],citations:[{document:'test.pdf',page:1,quote:'원문 인용 8자 이상'},{document:'test.pdf',page:2,quote:'추가 원문 인용문'}]}]}]);
assert.equal(incompleteChecks.sourceReady,false);
assert.equal(incompleteChecks.diagnostics.needsReview,1);
assert.deepEqual(complete.findings.map(f=>f.sourceBatch),[1,2]);
const partial=mergeCheckedBatches(expected,[result(1)]);
assert.equal(partial.sourceReady,false);
assert.deepEqual(partial.diagnostics.missingBatches,[2]);
const invalid=mergeCheckedBatches(expected,[result(1),result(2,true,[{verification:{status:'unmatched'}}])]);
assert.equal(invalid.sourceReady,false);
assert.equal(invalid.diagnostics.needsReview,1);
assert.equal(mergeCheckedBatches(expected,[result(1),result(2,false)]).sourceReady,false);
assert.throws(()=>mergeCheckedBatches(expected,[result(1),result(1)]),/DUPLICATE_BATCH_RESULT/);
assert.throws(()=>mergeCheckedBatches(expected,[result(3)]),/UNEXPECTED_BATCH_RESULT/);
console.log('PASS: checked batch merge preserves order and blocks missing, unsupported or duplicate batches');

const falselyReadyEmpty=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[]}]);
assert.equal(falselyReadyEmpty.sourceReady,false,'An empty batch cannot be marked source-checked');
const falselyReadyUnchecked=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[{title:'unsupported',citations:[],citationChecks:[]}]}]);
assert.equal(falselyReadyUnchecked.sourceReady,false,'A claimed sourceReady flag cannot bypass citation requirements');

const invalidEntry=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[null]}]);
assert.equal(invalidEntry.sourceReady,false);
assert.equal(invalidEntry.diagnostics.needsReview,1);

const invalidCheck=mergeCheckedBatches(expected,[result(1),result(2,true,[null])]);
assert.equal(invalidCheck.sourceReady,false);
assert.equal(invalidCheck.diagnostics.needsReview,1);

const invalidPage=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[{...result(2).findings[0],citations:[{document:'test.pdf',page:'1',quote:'원문 인용 8자 이상'}]}]}]);
assert.equal(invalidPage.sourceReady,false);
assert.equal(invalidPage.diagnostics.needsReview,1);

const shortQuote=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[{...result(2).findings[0],citations:[{document:'test.pdf',page:1,quote:'짧음'}]}]}]);
assert.equal(shortQuote.sourceReady,false);

const paddedQuote=mergeCheckedBatches(expected,[result(1),{...result(2),findings:[{...result(2).findings[0],citations:[{document:'test.pdf',page:1,quote:'가          나'}]}]}]);
assert.equal(paddedQuote.sourceReady,false);

for(const bad of [null,{}, {batch:0},{batch:'1'}])assert.throws(()=>mergeCheckedBatches({...expected,batches:[bad]},[]),/INVALID_EXPECTED_BATCHES/);
