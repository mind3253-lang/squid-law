import assert from 'node:assert/strict';
import {runPrivateComparisons} from '../analysis-private-comparisons.js';
const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 임대차기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증을 근거로 임대차기간 2년을 주장한다.'}]}
];
const credentials={apiKey:'test-key-not-real',model:'gpt-test'};
let calls=0;
const compare=async(_documents,lead,opts)=>{
 calls++;
 assert.equal(opts.enabled,true);
 return {sourceReady:true,reference:lead.reference,relation:'different_positions',explanation:'두 서면의 주장이 다르다.',citations:lead.sources};
};
await assert.rejects(runPrivateComparisons(documents,{compare}),/AI_COMPARISON_DISABLED/);
assert.equal(calls,0);
await assert.rejects(runPrivateComparisons(documents,{enabled:true,compare}),/MISSING_SERVER_API_KEY/);
await assert.rejects(runPrivateComparisons(documents,{enabled:true,apiKey:'test',compare}),/INVALID_MODEL/);
const result=await runPrivateComparisons(documents,{...credentials,enabled:true,compare});
assert.equal(result.comparisons.length,1);
assert.equal(result.sourceReady,true);
assert.equal(result.diagnostics.sourceVerified,1);
assert.equal(calls,1);
await assert.rejects(runPrivateComparisons(documents,{...credentials,enabled:true,maxComparisons:0,compare}),/INVALID_COMPARISON_LIMIT/);
const many=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 임대차기간 5년을 주장한다. 소갑 제4호증에 따른 지급도 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증을 근거로 임대차기간 2년을 주장한다. 소갑 제4호증에 따른 지급은 부인한다.'}]}
];
await assert.rejects(runPrivateComparisons(many,{...credentials,enabled:true,maxComparisons:1,compare}),/COMPARISON_BUDGET_EXCEEDED/);
assert.equal(calls,1,'Budget must reject before model calls');
await assert.rejects(runPrivateComparisons(documents,{...credentials,enabled:true,compare:async(_docs,lead)=>({sourceReady:true,relation:'different_positions',explanation:'문서 비교',citations:[{...lead.sources[0],quote:'위조된 인용'},lead.sources[1]]})}),/COMPARISON_CITATION_CHANGED/);
await assert.rejects(runPrivateComparisons(documents,{...credentials,enabled:true,compare:async()=>({sourceReady:false})}),/COMPARISON_RESULT_NOT_READY/);
const empty=await runPrivateComparisons([{name:'a.pdf',pages:[{text:'문서 A만의 표현'}]},{name:'b.pdf',pages:[{text:'다른 문서의 표현'}]}],{...credentials,enabled:true,compare});
assert.equal(empty.comparisons.length,0);
assert.equal(empty.sourceReady,false);
assert.equal(empty.diagnostics.reason,'NO_SHARED_REFERENCE_LEADS');
assert.equal(calls,1,'Empty comparison should not call AI');
console.log('PASS: comparison orchestrator enforces opt-in, source checks and request budget before AI calls');
