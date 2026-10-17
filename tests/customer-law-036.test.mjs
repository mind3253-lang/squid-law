import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeModelUsage} from '../lib/model-usage-observability.mjs';
test('LAW-036 records token usage without inventing pricing',()=>{
 const u=summarizeModelUsage({status:'completed',usage:{input_tokens:100,output_tokens:25,total_tokens:125}},{model:'gpt-test',stage:'legal_expert'});
 assert.equal(u.totalTokens,125);
 assert.equal(u.costUsd,null);
 assert.equal(u.outcome,'completed');
});
test('LAW-036 handles missing usage and sanitized failure codes',()=>{
 const u=summarizeModelUsage(null,{failureCode:'TIMEOUT: secret'});
 assert.equal(u.inputTokens,null);
 assert.equal(u.outcome,'failed');
 assert.equal(u.failureCode,'TIMEOUT__SECRET');
});
