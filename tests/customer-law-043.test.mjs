import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLegalExpertRequest} from '../lib/gpt-legal-expert.mjs';
const sha='a'.repeat(64);
const base={caseId:'SL-example',sourceVersion:sha,task:'evidence_weight',units:[{documentId:'contract',page:1,part:1,hash:sha,text:'계약 내용'}]};
test('LAW-043 client plaintiff and defendant both receive explicit strategy instructions',()=>{
 for(const role of ['plaintiff','defendant']){
  const r=buildLegalExpertRequest({...base,clientRole:role});
  assert.equal(JSON.parse(r.input[0].content[0].text.replace(/^Return a JSON object only\. /,'')).clientSide,role);
  for(const part of ['OFFENSE','DEFENSE','PROOF','RISK'])assert.ok(r.instructions.includes(part));
  assert.match(r.instructions,/client-owned claims/);
 }
});
test('LAW-043 never silently assumes which party the client represents',()=>{
 assert.throws(()=>buildLegalExpertRequest(base),/CLIENT_ROLE_REQUIRED/);
 assert.throws(()=>buildLegalExpertRequest({...base,clientRole:'unknown'}),/CLIENT_ROLE_REQUIRED/);
});
