import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {segmentRecord} from '../lib/record-chunks.mjs';
import {buildLegalReasoningRequest,parseLegalReasoningOutput} from '../lib/legal-reasoning-provider.mjs';
const units=segmentRecord({scope:'customer',documentId:'contract',pages:[{page:71,text:'임대차기간 5년'}]}).segments;
const source={documentId:units[0].documentId,page:units[0].page,part:units[0].part,hash:units[0].hash,quote:'5년'};
test('legal model response cannot invent quote or page number',()=>{
 const request=buildLegalReasoningRequest({model:'configured',caseId:'case',units});
 assert.equal(request.model,'configured');
 const claim={id:'c1',type:'claim',statement:'5년 주장',sources:[source]};
 const valid=parseLegalReasoningOutput({units,response:JSON.stringify({propositions:[claim]})});
 assert.equal(valid.accepted,true);assert.equal(valid.semanticVerified,false);
 assert.equal(parseLegalReasoningOutput({units,response:{propositions:[{...claim,sources:[{...source,page:1}]}]}}).accepted,false);
 assert.equal(parseLegalReasoningOutput({units,response:{propositions:[{...claim,sources:[{...source,quote:'10년'}]}]}}).accepted,false);
 assert.equal(parseLegalReasoningOutput({units,response:{mock:true,propositions:[claim]}}).accepted,false);
 assert.equal(parseLegalReasoningOutput({units,response:JSON.stringify({mock:true,propositions:[claim]})}).accepted,false);
});
test('overlong legal sources must be split rather than truncated',()=>{
 const huge=segmentRecord({scope:'customer',documentId:'large',pages:Array.from({length:12},(_,i)=>({page:i+1,text:'법'.repeat(10000)}))}).segments;
 assert.throws(()=>buildLegalReasoningRequest({model:'configured',caseId:'case',units:huge}),/REASONING_BATCH_REQUIRED/);
});
