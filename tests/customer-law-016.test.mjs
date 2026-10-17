import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateDocuments,mergeDocumentBoundaryCandidates} from '../api/customer-document-boundaries.js';
import {auditBoundaryReview} from '../lib/independent-boundary-review.mjs';
test('LAW-016 reject duplicate source pages',()=>{
 assert.throws(()=>candidateDocuments([{documentId:'doc',page:1,text:'a'},{documentId:'doc',page:1,text:'b'}]),/DUPLICATE_OR_INVALID_SOURCE_PAGE/);
});
test('LAW-016 reject missing, repeated or unordered boundary pages',()=>{
 const section=(pages)=>({documentId:'doc',pages,startPage:pages[0],endPage:pages.at(-1),classification:'미검증 후보',kind:'기타'});
 const merge=(sections)=>mergeDocumentBoundaryCandidates({documentId:'doc',pageCount:3,batches:[{documentId:'doc',sections}]});
 assert.equal(merge([section([1,2,3])]).coveredPages,3);
 assert.throws(()=>merge([section([1,3,2])]),/INVALID_BOUNDARY_RANGE/);
 assert.throws(()=>merge([section([1,2]),section([2,3])]),/INVALID_BOUNDARY_PAGE/);
 assert.throws(()=>merge([section([1]),section([3])]),/BOUNDARY_SEQUENCE_GAP_OR_OVERLAP/);
});
test('LAW-016 independent audit rejects gaps',()=>{
 const result={documentId:'doc',sourcePdfSha256:'a'.repeat(64),unreviewedPages:[],sections:[{kind:'기타',startPage:2,endPage:3,evidencePage:2,reason:'test'}]};
 assert.equal(auditBoundaryReview({result,documentId:'doc',sourcePdfSha256:'a'.repeat(64),pageCount:3}).complete,false);
});
