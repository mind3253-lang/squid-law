import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPageDigests} from '../lib/page-digests.mjs';
import {assertPageBatch,assertBatchManifest} from '../lib/batch-integrity.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('LAW-012 page digest detects changed text and missing digest',()=>{
 const page={page:1,text:'original',textSha256:hash('original')};
 assert.equal(verifyPageDigests([page],{requireDigests:true}).complete,true);
 assert.equal(verifyPageDigests([{...page,text:'tampered'}],{requireDigests:true}).failures[0].reason,'PAGE_TEXT_HASH_MISMATCH');
 assert.equal(verifyPageDigests([{page:1,text:'original'}],{requireDigests:true}).failures[0].reason,'MISSING_TEXT_HASH');
});
test('LAW-012 batch sequence and manifest reject gaps and duplicates',()=>{
 assert.deepEqual(assertPageBatch({pages:[{page:1},{page:2}],pageOffset:0,pageCount:2,batchSize:2}),{startPage:1,endPage:2,finished:true,nextOffset:2});
 assert.throws(()=>assertPageBatch({pages:[{page:1},{page:3}],pageOffset:0,pageCount:2,batchSize:2}),/INVALID_PAGE_SEQUENCE/);
 assert.equal(assertBatchManifest({batches:['part1.json','part2.json'],pageCount:3,batchSize:2}),true);
 assert.throws(()=>assertBatchManifest({batches:['part1.json','part1.json'],pageCount:3,batchSize:2}),/INVALID_BATCH_MANIFEST/);
});
