import assert from 'node:assert/strict';
import {runPrivateAnalysis} from '../analysis-private-runner.js';

const documents=[{name:'원고.pdf',pages:[{text:'원고는 계약기간이 5년이라고 주장한다.'}]},{name:'피고.pdf',pages:[{text:'피고는 계약기간이 2년이라고 주장한다.'}]}];
let requests=0;
const mock=async(_url,options)=>{
 requests++;
 const body=JSON.parse(options.body);
 const json=JSON.parse(body.input.slice(body.input.indexOf('{')));
 const page=json.pages[0];
 const findings={schema:'squidlaw-findings-v1',findings:[{title:'문서별 주장',citations:[{document:page.document,page:page.page,quote:page.text}]}]};
 return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(findings)}]}]})};
};
const config={enabled:true,apiKey:'test-secret',model:'gpt-test',fetchImpl:mock,batches:{maxBatchPages:1,maxBatchChars:100}};
await assert.rejects(runPrivateAnalysis(documents,{...config,enabled:false}),/AI_WORKER_DISABLED/);
assert.equal(requests,0);
const result=await runPrivateAnalysis(documents,config);
assert.equal(requests,2);
assert.equal(result.sourceReady,true);
assert.equal(result.findings.length,2);
assert.deepEqual(result.findings.map(f=>f.sourceBatch),[1,2]);
await assert.rejects(runPrivateAnalysis(documents,{...config,maxBatches:1}),/TOO_MANY_BATCHES/);
assert.equal(requests,2);
let failedCalls=0;
const failSecond=async(...args)=>{failedCalls++;if(failedCalls===2)return {ok:false};return mock(...args);};
await assert.rejects(runPrivateAnalysis(documents,{...config,fetchImpl:failSecond}),/MODEL_REQUEST_FAILED/);
assert.equal(failedCalls,2);
console.log('PASS: private AI runner disabled by default, checks each source and stops on incomplete jobs');
