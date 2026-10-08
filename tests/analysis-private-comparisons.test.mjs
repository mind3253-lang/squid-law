import assert from 'node:assert/strict';
import {runPrivateComparisons} from '../analysis-private-comparisons.js';
const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 임대차기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증을 근거로 임대차기간 2년을 주장한다.'}]}
];
let calls=0;
const compare=async(_documents,lead,opts)=>{
 calls++;
 assert.equal(opts.enabled,true);
 return {sourceReady:true,reference:lead.reference,relation:'different_positions',citations:lead.sources};
};
await assert.rejects(runPrivateComparisons(documents,{compare}),/AI_COMPARISON_DISABLED/);
assert.equal(calls,0);
const result=await runPrivateComparisons(documents,{enabled:true,compare});
assert.equal(result.comparisons.length,1);
assert.equal(result.sourceReady,true);
assert.equal(result.diagnostics.sourceVerified,1);
assert.equal(calls,1);
await assert.rejects(runPrivateComparisons(documents,{enabled:true,maxComparisons:0,compare}),/INVALID_COMPARISON_LIMIT/);
const many=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 임대차기간 5년을 주장한다. 소갑 제4호증에 따른 지급도 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증을 근거로 임대차기간 2년을 주장한다. 소갑 제4호증에 따른 지급은 부인한다.'}]}
];
await assert.rejects(runPrivateComparisons(many,{enabled:true,maxComparisons:1,compare}),/COMPARISON_BUDGET_EXCEEDED/);
assert.equal(calls,1,'Budget must reject before model calls');
await assert.rejects(runPrivateComparisons(documents,{enabled:true,compare:async()=>({sourceReady:false})}),/COMPARISON_RESULT_NOT_READY/);
console.log('PASS: comparison orchestrator enforces opt-in, source checks and request budget before AI calls');
