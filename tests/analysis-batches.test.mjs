import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
async function load(path){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
const {prepareAnalysisInput}=await load('analysis-input.js');
const {batchAnalysisInput}=await load('analysis-batches.js');
const docs=[
 {name:'원고.pdf',pages:[{text:'계약기간 5년 주장'},{text:''},{text:'임대료 미납 주장'}]},
 {name:'피고.pdf',pages:[{text:'계약기간 2년 주장'},{text:'보증금 반환 주장'}]}
];
const input=prepareAnalysisInput(docs);
const result=batchAnalysisInput(input,{maxBatchPages:2,maxBatchChars:100});
assert.equal(result.batches.length,2);
assert.deepEqual(result.batches.flatMap(b=>b.pages.map(p=>[p.document,p.page])),[['원고.pdf',1],['원고.pdf',3],['피고.pdf',1],['피고.pdf',2]]);
assert.equal(result.unreadablePages,1);
assert.equal(result.totalPages,4);
assert.ok(result.batches.every(b=>b.pages.length<=2&&b.characterCount<=100));
const limited=batchAnalysisInput(input,{maxBatchPages:20,maxBatchChars:20});
assert.ok(limited.batches.every(b=>b.characterCount<=20));
assert.throws(()=>batchAnalysisInput(input,{maxBatchChars:5}),/SOURCE_PAGE_TOO_LARGE/);
assert.throws(()=>batchAnalysisInput(input,{maxBatchPages:0}),/INVALID_BATCH_LIMITS/);
assert.throws(()=>batchAnalysisInput({schema:'wrong',pages:[]}),/INVALID_ANALYSIS_INPUT/);
console.log('PASS: source page batches preserve document/page references, skip blank pages, enforce limits');
