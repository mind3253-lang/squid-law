import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPageDigests} from '../lib/page-digests.mjs';
import {assertPageBatch} from '../lib/batch-integrity.mjs';
import {uploadDigest} from '../lib/skynet-upload-digest.mjs';
import {auditPageCoverage} from '../lib/customer-source-ingest-audit.mjs';
import * as core from '../lib/shared-source-integrity.mjs';
test('SKYNET and SQUIDLAW use the same integrity functions',()=>{
 assert.equal(verifyPageDigests,core.verifyPageDigests);
 assert.equal(assertPageBatch,core.assertPageBatch);
 assert.equal(uploadDigest,core.uploadDigest);
 assert.equal(auditPageCoverage,core.auditPageCoverage);
});
test('shared integrity catches source corruption and missing pages',()=>{
 const text='page one',digest=core.sha256(text);
 assert.equal(verifyPageDigests([{page:1,text,textSha256:digest}],{requireDigests:true}).complete,true);
 assert.equal(verifyPageDigests([{page:1,text:'changed',textSha256:digest}],{requireDigests:true}).complete,false);
 assert.equal(auditPageCoverage({pageCount:2,batches:[{pages:[{page:1}]}]}).complete,false);
 assert.throws(()=>assertPageBatch({pages:[{page:2}],pageOffset:0,pageCount:2,batchSize:1}),/INVALID_PAGE_SEQUENCE/);
});
