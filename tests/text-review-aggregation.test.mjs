import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateTextReview} from '../lib/text-review-aggregation.mjs';
const version='a'.repeat(64),root='private/job/';
const docs=[{id:'doc',pageCount:21}];
const outputs=[{path:root+'doc-00000000.json',payload:{documentId:'doc',sourceVersion:version,pageStart:1,pageCount:20,verifiedText:true,visualVerified:false,visualInventoryComplete:false,results:[]}},{path:root+'doc-00000020.json',payload:{documentId:'doc',sourceVersion:version,pageStart:21,pageCount:1,verifiedText:true,visualVerified:false,visualInventoryComplete:false,results:[]}}];
test('persisted text batches aggregate without falsely completing legal analysis',()=>{
 const r=aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs});
 assert.equal(r.status,'awaiting_visual_and_semantic_review');assert.equal(r.coverage[0].pages,21);assert.equal(r.verifiedLegal,false);
});
test('reject missing, duplicate, and forged batch coverage',()=>{
 for(const bad of [outputs.slice(0,1),[...outputs,outputs[0]],outputs.map((x,i)=>i?{...x,payload:{...x.payload,pageStart:20}}:x),outputs.map((x,i)=>i?{...x,payload:{...x.payload,sourceVersion:'b'.repeat(64)}}:x)]){
  assert.throws(()=>aggregateTextReview({caseId:'case',sourceVersion:version,root,documents:docs,outputs:bad}));
 }
});
