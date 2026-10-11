import {test} from 'node:test';import {strict as assert} from 'node:assert';import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
test('10001 pages without truncation',()=>{const pages=Array.from({length:10001},(_,i)=>({page:i+1,text:'가'.repeat(i%3?21:21001)}));const r=segmentRecord({scope:'skynet',documentId:'d1',pages});assert.equal(r.pages,10001);assert.equal(r.characters,pages.reduce((n,p)=>n+p.text.length,0));assert.equal(auditSegments(pages,r.segments).complete,true)});
test('OCR required',()=>{const pages=[{page:1,text:'text'},{page:2,text:''}];const r=segmentRecord({scope:'customer',documentId:'x',pages});assert.equal(r.segments.at(-1).status,'ocr_required');assert.equal(auditSegments(pages,r.segments.filter(x=>x.page!==2)).complete,false)});
test('duplicate page rejected',()=>assert.throws(()=>segmentRecord({scope:'customer',documentId:'x',pages:[{page:1,text:'a'},{page:1,text:'b'}]})));

test('shared corpus rejects incomplete document',async()=>{const {prepareCorpus}=await import('../lib/corpus-coverage.mjs');assert.throws(()=>prepareCorpus('customer',[{id:'a',pageCount:2,pages:[{page:1,text:'x'}]}]));});
test('shared corpus supports both isolated scopes',async()=>{const {prepareCorpus,auditAnalysis}=await import('../lib/corpus-coverage.mjs');for(const scope of ['customer','skynet']){const c=prepareCorpus(scope,[{id:'a',pageCount:1,pages:[{page:1,text:'원문'}]}]);assert.equal(c.units.length,1);assert.equal(c.scope,scope);assert.equal(auditAnalysis(c,[]).complete,false)}});

test('evidence review keeps source hashes and rejects missing verification',async()=>{
 const {analyzeUnit,independentlyVerify,crosscheckObservations}=await import('../lib/legal-evidence-review.mjs');
 const {prepareCorpus}=await import('../lib/corpus-coverage.mjs');
 const corpus=prepareCorpus('customer',[{id:'a',pageCount:1,pages:[{page:1,text:'2023.11.07 계약 100만원 지급'}]},{id:'b',pageCount:1,pages:[{page:1,text:'2023.11.07 계약 100만원 수령'}]}]);
 const results=corpus.units.map(analyzeUnit);
 assert.equal(independentlyVerify(corpus.units,results).complete,true);
 assert.equal(independentlyVerify(corpus.units,results.slice(1)).complete,false);
 assert.ok(crosscheckObservations(results).length>0);
 assert.equal(corpus.completeVisualCoverage,false);
});
test('shared corpus rejects duplicate document and page',async()=>{
 const {prepareCorpus}=await import('../lib/corpus-coverage.mjs');
 assert.throws(()=>prepareCorpus('customer',[{id:'a',pageCount:2,pages:[{page:1,text:'x'},{page:1,text:'y'}]}]));
 assert.throws(()=>prepareCorpus('customer',[{id:'a',pageCount:1,pages:[{page:1,text:'x'}]},{id:'a',pageCount:1,pages:[{page:1,text:'y'}]}]));
});

test('claim candidates retain exact source location',async()=>{
 const {prepareCorpus}=await import('../lib/corpus-coverage.mjs');
 const {analyzeUnit}=await import('../lib/legal-evidence-review.mjs');
 const unit=prepareCorpus('skynet',[{id:'case-doc',pageCount:1,pages:[{page:1,text:'피고는 대여금 청구를 부인한다.'}]}]).units[0];
 const result=analyzeUnit(unit);assert.ok(result.claimCandidates.length>0);assert.equal(result.claimCandidates[0].source.page,1);assert.equal(result.claimCandidates[0].source.documentId,'case-doc');
});

test('10001 pages partition and resume with no page loss',async()=>{
 const {pageBatches}=await import('../lib/corpus-coverage.mjs');
 const pages=Array.from({length:10001},(_,i)=>({page:i+1,text:'원문 '+i}));
 const batches=pageBatches(pages,20);assert.equal(batches.length,501);
 assert.deepEqual(batches.flatMap(b=>b.pages.map(p=>p.page)),pages.map(p=>p.page));
 assert.equal(batches.at(-1).offset,10000);
});

test('OCR-required page never counts as complete text coverage',async()=>{
 const {prepareCorpus}=await import('../lib/corpus-coverage.mjs');
 const corpus=prepareCorpus('customer',[{id:'scan',pageCount:2,pages:[{page:1,text:'법률 원문'},{page:2,text:''}]}]);
 assert.equal(corpus.completeTextCoverage,false);
 assert.equal(corpus.completeVisualCoverage,false);
});


test('absolute source page and hash survive a later batch',async()=>{
 const {analyzeUnit,independentlyVerify}=await import('../lib/legal-evidence-review.mjs');
 const pages=Array.from({length:20},(_,i)=>({page:201+i,text:'2023.11.07 계약금 '+(i+1)+'만원'}));
 const segmented=segmentRecord({scope:'customer',documentId:'original-document',pages});
 assert.equal(auditSegments(pages,segmented.segments).complete,true);
 assert.deepEqual(segmented.segments.map(u=>u.page),pages.map(p=>p.page));
 const review=segmented.segments.map(analyzeUnit);
 assert.equal(independentlyVerify(segmented.segments,review).complete,true);
 assert.equal(review[0].observations[0].source.page,201);
 assert.equal(review[0].observations[0].source.hash,segmented.segments[0].hash);
});

test('a blank source page blocks text review without silently skipping',async()=>{
 const {analyzeUnit,independentlyVerify}=await import('../lib/legal-evidence-review.mjs');
 const pages=[{page:41,text:'증거 원문'},{page:42,text:''}];
 const segmented=segmentRecord({scope:'customer',documentId:'original-document',pages});
 const result=independentlyVerify(segmented.segments,segmented.segments.map(analyzeUnit));
 assert.equal(result.complete,false);
 assert.equal(result.missing[0].page,42);
});

test('independent review rejects duplicate and forged chunk counts',async()=>{
 const {analyzeUnit,independentlyVerify}=await import('../lib/legal-evidence-review.mjs');
 const u=segmentRecord({scope:'customer',documentId:'d',pages:[{page:1,text:'확인할 원문'}]}).segments;
 const r=u.map(analyzeUnit);
 assert.equal(independentlyVerify(u,r).complete,true);
 assert.equal(independentlyVerify(u,[...r,...r]).complete,false);
 assert.equal(independentlyVerify(u,[{...r[0],parts:2}]).complete,false);
});
