import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createProviderGate,authorizeProviderCall,mockProviderResponse} from '../lib/provider-gate.mjs';
import {buildVisionRequest} from '../lib/visual-evidence.mjs';
const hash='f'.repeat(64);
test('paid API is disabled without consent, budget and data transfer approval',()=>{
 const input={estimatedUsd:0.25,sourceId:'case/doc/page1',contentHash:hash};
 assert.equal(authorizeProviderCall(createProviderGate(),input).allowed,false);
 assert.equal(authorizeProviderCall(createProviderGate({enabled:true,approved:true,model:'configured',maxUsd:10}),input).reason,'CONSENT_REQUIRED');
 assert.equal(authorizeProviderCall(createProviderGate({enabled:true,approved:true,allowExternalTransfer:true,model:'configured',maxUsd:0.2}),input).reason,'BUDGET_EXCEEDED');
 const gate=createProviderGate({enabled:true,approved:true,allowExternalTransfer:true,model:'configured',maxUsd:1});
 assert.equal(authorizeProviderCall(gate,input).allowed,true);
 assert.equal(authorizeProviderCall(gate,input).requestKey,authorizeProviderCall(gate,input).requestKey);
});
test('vision mock is never misrepresented as verified real provider output',()=>{
 const req=buildVisionRequest({documentId:'doc',page:1,imageSha256:hash,dataUrl:'data:image/png;base64,YQ==',model:'mock-model'});
 const result=mockProviderResponse(req,{observedText:'계약서'});
 assert.equal(result.mock,true);assert.equal(result.verified,false);assert.equal(result.usage.costUsd,0);
});
