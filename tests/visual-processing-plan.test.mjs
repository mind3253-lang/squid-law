import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {prepareVisionBatch} from '../lib/visual-processing-plan.mjs';
import {createProviderGate} from '../lib/provider-gate.mjs';
test('rendered image produces source-bound request but no paid execution without consent',()=>{
 const input={documentId:'doc',renderedPages:[{page:3,mime:'image/png',bytes:Buffer.from('mock-png')}],gate:createProviderGate({model:'configured'}),model:'configured',estimatedUsdPerPage:0.5};
 const blocked=prepareVisionBatch(input);
 assert.equal(blocked.authorized,false);assert.equal(blocked.executed,false);
 assert.equal(blocked.pages[0].request.metadata.sourcePage,'3');
 const approved=prepareVisionBatch({...input,gate:createProviderGate({enabled:true,approved:true,allowExternalTransfer:true,model:'configured',maxUsd:1})});
 assert.equal(approved.authorized,true);assert.equal(approved.executed,false);
});

test('whole-batch budget blocks individually affordable pages that exceed total cap',()=>{
 const pages=Array.from({length:3},(_,i)=>({page:i+1,mime:'image/png',bytes:Buffer.from('page'+i)}));
 const result=prepareVisionBatch({documentId:'doc',renderedPages:pages,gate:createProviderGate({enabled:true,approved:true,allowExternalTransfer:true,model:'configured',maxUsd:1}),estimatedUsdPerPage:0.5});
 assert.equal(result.authorized,false);
 assert.ok(result.pages.every(p=>p.permission.reason==='BATCH_BUDGET_EXCEEDED'));
});
