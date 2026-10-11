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
