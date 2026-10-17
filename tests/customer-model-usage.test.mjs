import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateModelUsage,summarizeModelUsage} from '../lib/model-usage-observability.mjs';
test('actual usage is grouped by model without assigning prices',()=>{
 const a=summarizeModelUsage({status:'completed',usage:{input_tokens:120,output_tokens:30,total_tokens:150}},{model:'gpt-test',stage:'legal_expert'});
 const b=summarizeModelUsage({status:'completed',usage:{input_tokens:80,output_tokens:20,total_tokens:100}},{model:'gpt-test',stage:'legal_expert'});
 const sum=aggregateModelUsage([a,b]);
 assert.equal(sum.apiCalls,2);assert.equal(sum.byModel[0].inputTokens,200);
 assert.equal(sum.byModel[0].outputTokens,50);assert.equal(sum.costUsd,null);
});
test('missing provider usage is explicitly unmetered',()=>{
 const sum=aggregateModelUsage([summarizeModelUsage({status:'completed'},{model:'test'})]);
 assert.equal(sum.unmeteredCalls,1);assert.equal(sum.byModel[0].inputTokens,0);
});
