import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditPageCoverage} from '../lib/customer-source-ingest-audit.mjs';
import {assertPageBatch} from '../lib/batch-integrity.mjs';
import {verifyPageDigests} from '../lib/page-digests.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
test('LAW-037 synthetic 500-page source verifies across checkpoint batches',()=>{
 const pages=Array.from({length:500},(_,i)=>({page:i+1,text:'evidence page '+(i+1),textSha256:digest('evidence page '+(i+1))}));
 const batches=[];
 for(let offset=0;offset<500;offset+=20){
  const batch=pages.slice(offset,offset+20);
  assert.equal(assertPageBatch({pages:batch,pageOffset:offset,pageCount:500,batchSize:20}).nextOffset,offset+batch.length);
  assert.equal(verifyPageDigests(batch,{requireDigests:true}).complete,true);
  batches.push({pages:batch});
 }
 assert.deepEqual(auditPageCoverage({pageCount:500,batches}).missingPages,[]);
 assert.equal(auditPageCoverage({pageCount:500,batches}).verifiedPages,500);
});
test('LAW-037 checkpoint corruption and duplicate page fail closed',()=>{
 const page={page:1,text:'original',textSha256:digest('original')};
 assert.equal(verifyPageDigests([{...page,text:'changed'}],{requireDigests:true}).complete,false);
 assert.throws(()=>auditPageCoverage({pageCount:2,batches:[{pages:[page]},{pages:[page]}]}),/DUPLICATE_PAGE/);
 assert.throws(()=>assertPageBatch({pages:[{page:2}],pageOffset:0,pageCount:2,batchSize:1}),/INVALID_PAGE_SEQUENCE/);
});
