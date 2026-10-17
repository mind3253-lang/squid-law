import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBoundaryReview,compareBoundaryReviews} from '../lib/independent-boundary-review.mjs';
const sha='a'.repeat(64),base={documentId:'doc',sourcePdfSha256:sha,sections:[{kind:'소장',startPage:1,endPage:2,evidencePage:1,reason:'첫 장 표제'}],unreviewedPages:[]};
const args={documentId:'doc',sourcePdfSha256:sha,pageCount:2};
test('LAW-017 rejects non-contiguous or malformed section ranges',()=>{
 assert.equal(auditBoundaryReview({result:base,...args}).complete,true);
 assert.equal(auditBoundaryReview({result:{...base,sections:[{...base.sections[0],startPage:'1'}]},...args}).complete,false);
 assert.equal(auditBoundaryReview({result:{...base,sections:[null]},...args}).complete,false);
});
test('LAW-017 requires independently matching boundaries',()=>{
 const different={...base,sections:[{...base.sections[0],kind:'답변서'}]};
 assert.equal(compareBoundaryReviews({primary:base,independent:different,...args}).verified,false);
});
