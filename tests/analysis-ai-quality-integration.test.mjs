import assert from 'node:assert/strict';
import {runPrivateAnalysis} from '../analysis-private-runner.js';
import {evaluateAnalysisFixture} from '../analysis-evaluation.js';
import {readFileSync} from 'node:fs';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/synthetic-lease-evaluation.json',import.meta.url),'utf8'));
const documents=[
 {name:'가상원고.pdf',pages:[{text:'원고는 임대차기간이 5년이라고 주장한다. 계약서에 5년으로 기재되었다.'}]},
 {name:'가상피고.pdf',pages:[{text:'피고는 임대차기간이 2년이라고 주장한다. 원고 주장에 동의하지 않는다.'}]}
];
const config={enabled:true,apiKey:'test-only-not-real',model:'gpt-test',batches:{maxBatchPages:1,maxBatchChars:300}};
function mockedModel({omitDefense=false,fabricateConclusion=false,alterQuote=false}={}){
 let requests=0;
 const fetchImpl=async(_url,options)=>{
  requests++;
  const request=JSON.parse(options.body);
  assert.equal(request.store,false);
  const batch=JSON.parse(request.input.slice(request.input.indexOf('{')));
  const page=batch.pages[0];
  const plaintiff=page.document==='가상원고.pdf';
  const findings=omitDefense&&!plaintiff?[]:[{
   title:fabricateConclusion&&plaintiff?'원고 100% 승소 확정':plaintiff?'원고는 임대차기간 5년을 주장':'피고는 임대차기간 2년을 주장',
   citations:[{document:page.document,page:page.page,quote:alterQuote&&plaintiff?'원고는 임대차기간이 3년이라고 주장한다.':page.text}]
  }];
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({schema:'squidlaw-findings-v1',findings})}]}]})};
 };
 return {fetchImpl,getRequests:()=>requests};
}
const goodMock=mockedModel();
const good=await runPrivateAnalysis(documents,{...config,fetchImpl:goodMock.fetchImpl});
assert.equal(goodMock.getRequests(),2);
assert.equal(good.sourceReady,true);
assert.equal(evaluateAnalysisFixture(good,fixture).passed,true);
const omitted=await runPrivateAnalysis(documents,{...config,fetchImpl:mockedModel({omitDefense:true}).fetchImpl});
assert.equal(omitted.sourceReady,false);
assert.equal(evaluateAnalysisFixture(omitted,fixture).passed,false);
const fabricated=await runPrivateAnalysis(documents,{...config,fetchImpl:mockedModel({fabricateConclusion:true}).fetchImpl});
assert.equal(fabricated.sourceReady,true,'A valid quotation alone cannot prove a model title is true');
const fabricationCheck=evaluateAnalysisFixture(fabricated,fixture);
assert.equal(fabricationCheck.passed,false);
assert.ok(fabricationCheck.presentForbidden.includes('100% 승소'));
const altered=await runPrivateAnalysis(documents,{...config,fetchImpl:mockedModel({alterQuote:true}).fetchImpl});
assert.equal(altered.sourceReady,false);
assert.equal(evaluateAnalysisFixture(altered,fixture).passed,false);
console.log('PASS: simulated AI-to-evaluation flow accepts supported claims and rejects omissions, fabricated conclusions and altered quotations');
