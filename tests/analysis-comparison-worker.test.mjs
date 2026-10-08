import assert from 'node:assert/strict';
import {buildCrossDocumentLeads} from '../analysis-cross-document.js';
import {analyzeComparisonWithModel} from '../analysis-comparison-worker.js';
const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 임대차기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증을 근거로 임대차기간 2년을 주장한다.'}]}
];
const lead=buildCrossDocumentLeads(documents).leads[0];
let calls=0;
const mock=async(_url,options)=>{
 calls++;
 const body=JSON.parse(options.body);
 assert.equal(body.store,false);
 assert.equal(body.text.format.type,'json_schema');
 assert.equal(body.text.format.strict,true);
 assert.equal(body.text.format.name,'squidlaw_comparison');
 const payload={relation:'different_positions',explanation:'두 문서의 계약기간 주장이 다르므로 추가 검토가 필요하다.',citations:lead.sources};
 return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]})};
};
const config={enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:mock};
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,enabled:false}),/AI_COMPARISON_DISABLED/);
assert.equal(calls,0);
const checked=await analyzeComparisonWithModel(documents,lead,config);
assert.equal(checked.sourceReady,true);
assert.deepEqual(checked.citations.map(c=>c.verification.status),['matched','matched']);
assert.equal(calls,1);
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,fetchImpl:async()=>({ok:false})}),/COMPARISON_MODEL_REQUEST_FAILED/);
const altered=async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({relation:'conflict_candidate',explanation:'충돌 가능성',citations:[{...lead.sources[0],quote:'원문에 없는 문장'},lead.sources[1]]})}]}]})});
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,fetchImpl:altered}),/COMPARISON_CITATION_CHANGED/);
const refusal=async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'refusal'}]}]})});
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,fetchImpl:refusal}),/COMPARISON_MODEL_REFUSED/);
for(const bad of [
 {ok:true},
 {ok:true,json:async()=>null},
 {ok:true,json:async()=>({status:'completed',output:[]})},
 {ok:true,json:async()=>({status:'completed',output:[null]})},
 {ok:true,json:async()=>({status:'completed',output:[{content:[null]}]})},
 {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{}'}]}]})}
]){
 await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,fetchImpl:async()=>bad}),/COMPARISON_MODEL_RESPONSE_INVALID|COMPARISON_MODEL_OUTPUT_INVALID|COMPARISON_MODEL_NOT_COMPLETED/);
}
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',incomplete_details:{reason:'max_output_tokens'},output:[]})})}),/COMPARISON_MODEL_INCOMPLETE/);
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...config,fetchImpl:async(_url,{signal})=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('aborted');},timeoutMs:1000}),/MODEL_REQUEST_TIMEOUT/);
console.log('PASS: private comparison worker rejects unapproved requests and verifies both original citations');

const configForBodyTimeout=config;
// Regression: a timeout while parsing the HTTP body is still a model timeout.
await assert.rejects(analyzeComparisonWithModel(documents,lead,{...configForBodyTimeout,fetchImpl:async(_url,{signal})=>({ok:true,json:async()=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('body aborted');}}),timeoutMs:1000}),/MODEL_REQUEST_TIMEOUT/);
