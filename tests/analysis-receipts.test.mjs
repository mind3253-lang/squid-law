import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createAnalysisReceipt,validateAnalysisReceipt} from '../lib/analysis-receipts.mjs';
test('stage receipts are deterministic and tamper evident',()=>{
 const a=createAnalysisReceipt({stage:'text_extract',sourceVersion:'a'.repeat(64),inputs:[{page:1,hash:'x'}],outputs:[{page:1,hash:'y'}],verified:true});
 const b=createAnalysisReceipt({stage:'text_extract',sourceVersion:'a'.repeat(64),inputs:[{hash:'x',page:1}],outputs:[{hash:'y',page:1}],verified:true});
 assert.equal(a.digest,b.digest);assert.equal(validateAnalysisReceipt(a),true);
 assert.equal(validateAnalysisReceipt({...a,verified:false}),false);
 assert.equal(validateAnalysisReceipt({...a,outputs:[{page:1,hash:'z'}]}),false);
});
