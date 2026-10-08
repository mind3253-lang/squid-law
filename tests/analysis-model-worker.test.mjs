import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uri=s=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(s).replace(/'/g,'%27');
const schema=uri(read('findings-schema.js'));
const prompt=uri(read('analysis-model-prompt.js'));
const parser=uri(read('analysis-model-response.js').replace("'./findings-schema.js'","'"+schema+"'"));
const worker=uri(read('analysis-model-worker.js').replace("'./analysis-model-prompt.js'","'"+prompt+"'").replace("'./analysis-model-response.js'","'"+parser+"'"));
const {analyzeBatchWithModel}=await import(worker);
const batch={schema:'squidlaw-analysis-batch-v1',batch:1,pages:[{document:'원고.pdf',page:1,text:'계약기간은 5년이라고 주장하였다.'}]};
let calls=0;
const mock=async(url,options)=>{
 calls++;
 assert.equal(url,'https://api.openai.com/v1/responses');
 assert.equal(options.headers.Authorization,'Bearer test-secret');
 const body=JSON.parse(options.body);
 assert.equal(body.store,false);
 assert.equal(body.text.format.type,'json_schema');
 assert.equal(body.text.format.strict,true);
 assert.equal(body.text.format.name,'squidlaw_findings');
 assert.deepEqual(body.text.format.schema.required,['schema','findings']);
 assert.equal(body.text.format.schema.additionalProperties,false);
 assert.equal(body.text.format.schema.properties.findings.items.properties.citations.items.additionalProperties,false);
 return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({schema:'squidlaw-findings-v1',findings:[{title:'계약기간 주장',analysis:'계약기간 주장을 원문에서 확인',claim:'계약기간 주장',evidence:'원문 확인',rebuttal:'',proofGap:'',citations:[{document:'원고.pdf',page:1,quote:'계약기간은 5년이라고 주장하였다.'}]}]})}]}]})};
};
await assert.rejects(analyzeBatchWithModel(batch,{apiKey:'test-secret',model:'gpt-test',fetchImpl:mock}),/AI_WORKER_DISABLED/);
assert.equal(calls,0);
const result=await analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:mock});
assert.equal(result.findings.length,1);
assert.equal(calls,1);
await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,model:'gpt-test',fetchImpl:mock}),/MISSING_SERVER_API_KEY/);
await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:async()=>({ok:false})}),/MODEL_REQUEST_FAILED/);
await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:async()=>({ok:true,json:async()=>({status:'failed',output:[]})})}),/MODEL_RESPONSE_NOT_COMPLETED/);
await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete',output:[]})})}),/MODEL_RESPONSE_INCOMPLETE/);
await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'refusal',refusal:'Cannot comply'}]}]})})}),/MODEL_REFUSED/);
await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:async(_url,{signal})=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('aborted');},timeoutMs:1000}),/MODEL_REQUEST_TIMEOUT/);
console.log('PASS: worker stays disabled by default, mock request is private and output is validated');

const configForBodyTimeout={enabled:true,apiKey:'test-secret',model:'gpt-test'};
// Regression: a timeout while parsing the HTTP body is still a model timeout.
await assert.rejects(analyzeBatchWithModel(batch,{...configForBodyTimeout,fetchImpl:async(_url,{signal})=>({ok:true,json:async()=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('body aborted');}}),timeoutMs:1000}),/MODEL_REQUEST_TIMEOUT/);

await assert.rejects(analyzeBatchWithModel(batch,{
 enabled:true,apiKey:'test-secret',model:'gpt-test',
 fetchImpl:async()=>({ok:true,json:async()=>({
  status:'completed',
  output:[{content:[{type:'output_text',text:' '.repeat(120001)}]}]
 })})
}),/INVALID_MODEL_OUTPUT/);

await assert.rejects(analyzeBatchWithModel(batch,{enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:async()=>({ok:true,json:async()=>({status:'',output:[{content:[{type:'output_text',text:'{}'}]}]})})}),/MODEL_RESPONSE_NOT_COMPLETED/);
