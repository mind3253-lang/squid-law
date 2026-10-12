import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditVerifiedTextPages,auditDocumentBoundaryEvidence} from '../lib/source-completion-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const documents=[{id:'doc',sha256:sha('pdf'),pageCount:2}];
test('source verification accepts empty text page without image operators',()=>{
 const verifiedBatches=[{documentId:'doc',sourcePdfSha256:documents[0].sha256,pages:[{page:1,text:'text',textSha256:sha('text'),imageOperatorCount:0},{page:2,text:'',textSha256:sha(''),imageOperatorCount:0}]}];
 assert.equal(auditVerifiedTextPages({documents,verifiedBatches}).verified,true);
});
test('source verification rejects scanned page without OCR',()=>{
 const verifiedBatches=[{documentId:'doc',sourcePdfSha256:documents[0].sha256,pages:[{page:1,text:'text',textSha256:sha('text'),imageOperatorCount:0},{page:2,text:'',textSha256:sha(''),imageOperatorCount:2}]}];
 assert.equal(auditVerifiedTextPages({documents,verifiedBatches}).verified,false);
});
test('boundary candidates do not count as verified document identities',()=>{
 const aggregate={documentBoundaryCandidates:[{documentId:'doc',coveredPages:2,sections:[{kind:'소장',classification:'미검증 후보'}]}]};
 assert.equal(auditDocumentBoundaryEvidence({documents,aggregate}).verified,false);
});
