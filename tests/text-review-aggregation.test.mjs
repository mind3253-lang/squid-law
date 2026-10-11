import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateTextReview,aggregateTextReviewStreaming} from '../lib/text-review-aggregation.mjs';
const version='a'.repeat(64),root='private/job/';
const docs=[{id:'doc',pageCount:21}];
const unit=page=>({status:'verified',documentId:'doc',page,part:1,parts:1,hash:'a'.repeat(64),textHash:'b'.repeat(64),claimCandidates:[],observations:[]});
const outputs=[{path:root+'doc-00000000.json',payload:{documentId:'doc',sourceVersion:version,pageStart:1,pageCount:20,verifiedText:true,unitCount:20,visualVerified:false,visualInventoryComplete:false,results:Array.from({length:20},(_,i)=>unit(i+1))}},{path:root+'doc-00000020.json',payload:{documentId:'doc',sourceVersion:version,pageStart:21,pageCount:1,verifiedText:true,unitCount:1,visualVerified:false,visualInventoryComplete:false,results:[unit(21)]}}];
test('persisted text batches aggregate without falsely completing legal analysis',()=>{
 const r=aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs});
 assert.equal(r.status,'awaiting_visual_and_semantic_review');assert.equal(r.coverage[0].pages,21);assert.equal(r.verifiedLegal,false);
});
test('reject missing, duplicate, and forged batch coverage',()=>{
 for(const bad of [outputs.slice(0,1),[...outputs,outputs[0]],outputs.map((x,i)=>i?{...x,payload:{...x.payload,pageStart:20}}:x),outputs.map((x,i)=>i?{...x,payload:{...x.payload,sourceVersion:'b'.repeat(64)}}:x)]){
  assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:bad}));
 }
});

test('reject mismatched persisted observation counts',()=>{
 const forged=outputs.map((o,i)=>i?{...o,payload:{...o.payload,unitCount:2}}:o);
 assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:forged}),/TEXT_UNIT_COUNT_MISMATCH/);
});

test('reject forged source page, duplicate units and candidate provenance',()=>{
 const hash='a'.repeat(64),textHash='b'.repeat(64);
 const valid={status:'verified',documentId:'doc',page:1,part:1,parts:1,hash,textHash,observations:[],claimCandidates:[{text:'청구 부인',source:{documentId:'doc',page:1,part:1,hash}}]};
 const make=(results)=>outputs.map((o,i)=>i?o:{...o,payload:{...o.payload,unitCount:results.length,results}});
 const args=(results)=>({caseId:'case',sourceVersion:version,root,documents:docs,outputs:make(results)});
 assert.equal(aggregateTextReview(args([valid,...Array.from({length:19},(_,i)=>unit(i+2))])).observationCount,21);
 assert.throws(()=>aggregateTextReview(args([{...valid,page:21},...Array.from({length:19},(_,i)=>unit(i+2))])),/INVALID_TEXT_RESULT_PROVENANCE/);
 assert.throws(()=>aggregateTextReview(args([valid,valid,...Array.from({length:19},(_,i)=>unit(i+2))])),/DUPLICATE_TEXT_UNIT/);
 assert.throws(()=>aggregateTextReview(args([{...valid,claimCandidates:[{...valid.claimCandidates[0],source:{...valid.claimCandidates[0].source,page:2}}]},...Array.from({length:19},(_,i)=>unit(i+2))])),/INVALID_CANDIDATE_PROVENANCE/);
});

test('reject a missing page even when batch metadata claims complete coverage',()=>{
 const altered=outputs.map((o,i)=>i?o:{...o,payload:{...o.payload,results:o.payload.results.filter(r=>r.page!==10),unitCount:19}});
 assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:altered}),/TEXT_PAGE_UNIT_COVERAGE_INCOMPLETE/);
});

test('reject missing final chunk on a page',()=>{
 const changed=outputs.map((o,i)=>i?o:{...o,payload:{...o.payload,results:o.payload.results.map(r=>r.page===3?{...r,parts:2}:r)}});
 assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:changed}),/TEXT_PAGE_UNIT_COVERAGE_INCOMPLETE/);
});

test('unexpected persisted batch path must not pass manifest audit',()=>{
 const extra={path:root+'other-00000000.json',payload:outputs[0].payload};
 assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:[...outputs,extra]}),/TEXT_OUTPUT_MANIFEST_MISMATCH/);
});

test('streaming aggregate matches persisted batch coverage',async()=>{
 const byPath=new Map(outputs.map(o=>[o.path,o.payload]));
 const streamed=await aggregateTextReviewStreaming({caseId:'case',sourceVersion:version,root,documents:docs,loadBatch:async path=>byPath.get(path)});
 const original=aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs});
 assert.deepEqual(streamed,original);
});
test('streaming aggregation rejects missing and duplicate page parts',async()=>{
 const byPath=new Map(outputs.map(o=>[o.path,o.payload]));
 const loadBatch=async path=>path===outputs[0].path?{...byPath.get(path),results:byPath.get(path).results.slice(1),unitCount:19}:byPath.get(path);
 await assert.rejects(aggregateTextReviewStreaming({caseId:'case',sourceVersion:version,root,documents:docs,loadBatch}),/INCOMPLETE_PERSISTED_PAGE/);
});

test('10001-page streaming audit never skips the final partial batch',async()=>{
 const many=[{id:'huge',pageCount:10001}];let loads=0,last='';
 const result=await aggregateTextReviewStreaming({caseId:'large',sourceVersion:version,root,documents:many,loadBatch:async path=>{
  loads++;last=path;
  const offset=Number(path.match(/-(\d{8})\.json$/)[1]),count=Math.min(20,10001-offset);
  return {documentId:'huge',sourceVersion:version,pageStart:offset+1,pageCount:count,verifiedText:true,visualVerified:false,visualInventoryComplete:false,unitCount:count,results:Array.from({length:count},(_,i)=>({...unit(offset+i+1),documentId:'huge'}))};
 }});
 assert.equal(loads,501);assert.equal(last,root+'huge-00010000.json');
 assert.equal(result.observationCount,10001);assert.equal(result.coverage[0].pages,10001);
});

test('cross-document opposing claims remain unverified candidates',async()=>{
 const {detectOpposingStatements}=await import('../lib/case-crosscheck.mjs');
 const rows=[{claimCandidates:[{id:'one',text:'피고는 지급하였다 인정',terms:['지급'],source:{documentId:'a',page:1}}]},{claimCandidates:[{id:'two',text:'피고는 지급하지 않았다',terms:['지급'],source:{documentId:'b',page:2}}]}];
 const audit=detectOpposingStatements(rows);
 assert.equal(audit.candidates.length,1);
 assert.equal(audit.verified,false);
 assert.equal(audit.candidates[0].first.source.documentId,'a');
});

test('manifest rejects unsafe document path identifiers',async()=>{
 const {expectedTextReviewOutputs}=await import('../lib/text-review-manifest.mjs');
 for(const id of ['../outside','other/file','',null])assert.throws(()=>expectedTextReviewOutputs({root,documents:[{id,pageCount:1}]}),/INVALID_DOCUMENT_PAGES/);
});

test('streamed batch loads stay within eight concurrent reads',async()=>{
 let inflight=0,peak=0;
 const result=await aggregateTextReviewStreaming({caseId:'bounded',sourceVersion:version,root,documents:[{id:'doc',pageCount:338}],loadBatch:async path=>{
  inflight++;peak=Math.max(peak,inflight);
  await Promise.resolve();
  const offset=Number(path.slice(-13,-5)),count=Math.min(20,338-offset);
  inflight--;
  return {documentId:'doc',sourceVersion:version,pageStart:offset+1,pageCount:count,verifiedText:true,visualVerified:false,visualInventoryComplete:false,unitCount:count,results:Array.from({length:count},(_,i)=>unit(offset+i+1))};
 }});
 assert.equal(result.observationCount,338);
 assert.ok(peak<=8&&peak>1);
});

test('resumable finalization descriptor counts cover 338 and 10001 pages',async()=>{
 const {finalizationDescriptors}=await import('../lib/text-review-aggregation.mjs');
 for(const pages of [338,1000,10001]){
  const plan=finalizationDescriptors([{id:'large',pageCount:pages}]);
  assert.equal(plan.length,Math.ceil(pages/20));
  assert.equal(plan.reduce((sum,b)=>sum+b.count,0),pages);
  assert.equal(plan.at(-1).start,Math.floor((pages-1)/20)*20);
  for(let i=0;i<plan.length;i++)assert.equal(plan[i].start,i*20);
 }
 const two=finalizationDescriptors([{id:'a',pageCount:21},{id:'b',pageCount:1}]);
 assert.deepEqual(two.map(x=>[x.documentId,x.start,x.count]),[['a',0,20],['a',20,1],['b',0,1]]);
});

test('finalization part rejects tampered persisted claims',async()=>{
 const {validateFinalizationPart}=await import('../lib/text-review-aggregation.mjs');
 const {createHash}=await import('node:crypto');
 const part={sourceVersion:version,offset:0,batchCount:8,unitCount:160,claims:[],observations:[]};
 const sha256=createHash('sha256').update(JSON.stringify(part)).digest('hex');
 assert.equal(validateFinalizationPart(part,{sourceVersion:version,offset:0,batchCount:8,sha256}),true);
 assert.throws(()=>validateFinalizationPart({...part,unitCount:159},{sourceVersion:version,offset:0,batchCount:8,sha256}),/INVALID_FINALIZATION_PART/);
 assert.throws(()=>validateFinalizationPart(part,{sourceVersion:version,offset:8,batchCount:8,sha256}),/INVALID_FINALIZATION_PART/);
});
