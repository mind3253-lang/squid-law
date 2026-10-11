import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {auditLegalReasoningResult} from '../lib/legal-reasoning-audit.mjs';
const hash='a'.repeat(64),version='b'.repeat(64);
const request={caseId:'case',sourceVersion:version,ready:true,verified:false};
const sourceIndex=[{documentId:'d',page:12,part:2,hash}];
const result={caseId:'case',sourceVersion:version,findings:[{type:'legal_element',claim:'계약기간 주장 검토 필요',status:'unverified',sources:[{documentId:'d',page:12,part:2,hash}]}],independentAuditVerified:false};
test('source-linked legal reasoning remains unverified pending independent semantic audit',()=>{
 const audit=auditLegalReasoningResult({request,result,sourceIndex});
 assert.equal(audit.complete,true);
 assert.equal(audit.verified,false);
 assert.equal(audit.requiresIndependentSemanticAudit,true);
});
test('wrong page, hash and uncited conclusions are rejected',()=>{
 for(const bad of [
  {...result,findings:[{...result.findings[0],sources:[{documentId:'d',page:13,part:2,hash}]}]},
  {...result,findings:[{...result.findings[0],sources:[{documentId:'d',page:12,part:2,hash:'c'.repeat(64)}]}]},
  {...result,findings:[{...result.findings[0],sources:[]}]},
  {...result,independentAuditVerified:true}
 ])assert.equal(auditLegalReasoningResult({request,result:bad,sourceIndex}).complete,false);
});
test('unverified visual gate cannot authorize legal reasoning audit',()=>{
 assert.equal(auditLegalReasoningResult({request:{...request,ready:false},result,sourceIndex}).complete,false);
});

test('source-unit index covers 10001 pages and rejects duplicate or missing final page',async()=>{
 const {auditSourceUnitIndex}=await import('../lib/legal-reasoning-audit.mjs');
 const docs=[{id:'d',pageCount:10001}];
 const rows=Array.from({length:10001},(_,i)=>({documentId:'d',page:i+1,part:1,hash,textHash:hash}));
 assert.equal(auditSourceUnitIndex({documents:docs,sources:rows}).unitCount,10001);
 assert.throws(()=>auditSourceUnitIndex({documents:docs,sources:rows.slice(0,-1)}),/SOURCE_INDEX_PAGE_COVERAGE_INCOMPLETE/);
 assert.throws(()=>auditSourceUnitIndex({documents:docs,sources:[...rows,rows[0]]}),/DUPLICATE_SOURCE_INDEX_ENTRY/);
});
