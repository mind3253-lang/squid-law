import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateTextReview} from '../lib/text-review-aggregation.mjs';
const version='a'.repeat(64),root='private/job/';
const docs=[{id:'doc',pageCount:21}];
const outputs=[{path:root+'doc-00000000.json',payload:{documentId:'doc',sourceVersion:version,pageStart:1,pageCount:20,verifiedText:true,unitCount:0,visualVerified:false,visualInventoryComplete:false,results:[]}},{path:root+'doc-00000020.json',payload:{documentId:'doc',sourceVersion:version,pageStart:21,pageCount:1,verifiedText:true,unitCount:0,visualVerified:false,visualInventoryComplete:false,results:[]}}];
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
 const forged=outputs.map((o,i)=>i?{...o,payload:{...o.payload,unitCount:1}}:o);
 assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:forged}),/TEXT_UNIT_COUNT_MISMATCH/);
});

test('reject forged source page, duplicate units and candidate provenance',()=>{
 const hash='a'.repeat(64),textHash='b'.repeat(64);
 const valid={status:'verified',documentId:'doc',page:1,part:1,hash,textHash,claimCandidates:[{text:'청구 부인',source:{documentId:'doc',page:1,part:1,hash}}]};
 const make=(results)=>outputs.map((o,i)=>i?o:{...o,payload:{...o.payload,unitCount:results.length,results}});
 const args=(results)=>({caseId:'case',sourceVersion:version,root,documents:docs,outputs:make(results)});
 assert.equal(aggregateTextReview(args([valid])).observationCount,1);
 assert.throws(()=>aggregateTextReview(args([{...valid,page:21}])),/INVALID_TEXT_RESULT_PROVENANCE/);
 assert.throws(()=>aggregateTextReview(args([valid,valid])),/DUPLICATE_TEXT_UNIT/);
 assert.throws(()=>aggregateTextReview(args([{...valid,claimCandidates:[{...valid.claimCandidates[0],source:{...valid.claimCandidates[0].source,page:2}}]}])),/INVALID_CANDIDATE_PROVENANCE/);
});
