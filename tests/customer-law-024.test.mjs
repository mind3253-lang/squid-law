import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSemanticReviewRequest,validateSemanticReview} from '../lib/independent-semantic-review.mjs';
const version='a'.repeat(64),hash='b'.repeat(64);
const units=[{documentId:'doc',page:1,part:1,hash,text:'원문'}];
const findings=[{type:'claim',claim:'청구',sources:[{documentId:'doc',page:1,part:1,hash}]}];
test('LAW-024 independent review rejects duplicate original source keys',()=>{
 assert.throws(()=>buildSemanticReviewRequest({caseId:'case',sourceVersion:version,findings,sourceUnits:[...units,...units]}),/DUPLICATE_SOURCE/);
});
test('LAW-024 rejects unsupported, empty and malformed verdicts',()=>{
 const base={caseId:'case',sourceVersion:version,verdicts:[{index:0,supported:true,reason:'원문과 일치'}]};
 assert.equal(validateSemanticReview({response:base,caseId:'case',sourceVersion:version,findings}).complete,true);
 for(const verdict of [{index:0,supported:true,reason:' '},{index:0,supported:'true',reason:'yes'},{index:0,supported:false,reason:'반대 증거'}]){
  assert.equal(validateSemanticReview({response:{...base,verdicts:[verdict]},caseId:'case',sourceVersion:version,findings}).complete,false);
 }
});
