import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uri=s=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(s).replace(/'/g,'%27');
const sourceUri=uri(read('source-verification.js'));
const schemaUri=uri(read('findings-schema.js'));
const qualityUri=uri(read('analysis-quality.js'));
const batchSource=read('analysis-batch-results.js')
 .replace("'./source-verification.js'","'"+sourceUri+"'")
 .replace("'./findings-schema.js'","'"+schemaUri+"'")
 .replace("'./analysis-quality.js'","'"+qualityUri+"'");
const {validateBatchFindings}=await import(uri(batchSource));
const batch={schema:'squidlaw-analysis-batch-v1',batch:1,pages:[{document:'원고.pdf',page:3,text:'2026년 10월 7일 계약기간은 5년이라고 주장하였다.'}]};
const finding=(page,quote)=>({title:'계약기간 관련 주장',citations:[{document:'원고.pdf',page,quote}]});
const payload=findings=>({schema:'squidlaw-findings-v1',findings});
const good=validateBatchFindings(batch,payload([finding(3,'계약기간은 5년이라고 주장하였다.')]));
assert.equal(good.sourceReady,true);
assert.equal(good.quality.matched,1);
const wrong=validateBatchFindings(batch,payload([finding(3,'계약기간은 2년이라고 주장하였다.')]));
assert.equal(wrong.sourceReady,false);
assert.equal(wrong.quality.byStatus.unmatched,1);
const outside=validateBatchFindings(batch,payload([finding(2,'계약기간은 5년이라고 주장하였다.')]));
assert.equal(outside.sourceReady,false);
assert.equal(outside.quality.byStatus.outside_batch,1);
const noCitations=validateBatchFindings(batch,payload([{title:'근거 없는 주장',citations:[]}]));
assert.equal(noCitations.sourceReady,false);
assert.equal(noCitations.quality.missingCitations,1);
console.log('PASS: batch findings match source, reject altered quotes and out-of-batch pages');
