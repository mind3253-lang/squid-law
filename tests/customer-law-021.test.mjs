import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLegalReasoningResult} from '../lib/legal-reasoning-audit.mjs';
const hash='a'.repeat(64),request={caseId:'SL-abcde',sourceVersion:hash,ready:true,verified:false};
const sourceIndex=[{documentId:'contract',page:3,part:2,hash}];
const finding={type:'claim',claim:'계약기간에 관한 주장',status:'draft',sources:[{documentId:'contract',page:3,part:2,hash}]};
const audit=f=>auditLegalReasoningResult({request,result:{caseId:request.caseId,sourceVersion:hash,findings:[f]},sourceIndex});
test('LAW-021 matches exact source document/page/part/hash',()=>{
 assert.equal(audit(finding).complete,true);
 assert.ok(audit({...finding,sources:[{...finding.sources[0],page:4}]}).failures.some(x=>x.startsWith('UNVERIFIED_SOURCE')));
});
test('LAW-021 rejects invented or incomplete pinpoint spans',()=>{
 assert.ok(audit({...finding,sources:[{...finding.sources[0],startOffset:4}]}).failures.some(x=>x.startsWith('INVALID_SOURCE_SPAN')));
 assert.ok(audit({...finding,sources:[{...finding.sources[0],startOffset:9,endOffset:2}]}).failures.some(x=>x.startsWith('INVALID_SOURCE_SPAN')));
 assert.equal(audit({...finding,sources:[{...finding.sources[0],startOffset:0,endOffset:10}]}).complete,true);
});
