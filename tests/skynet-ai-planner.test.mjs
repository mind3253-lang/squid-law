import test from 'node:test';import assert from 'node:assert/strict';import {parsePlannerResponse} from '../lib/skynet-ai-planner.mjs';
test('parse a valid read-only development plan',()=>{const p=parsePlannerResponse(JSON.stringify({summary:'Inspect code',tasks:[{id:'read',title:'Inspect entrypoint',priority:'P0',dependsOn:[],toolCalls:[{name:'github.read',args:{owner:'acme',repo:'demo',path:'README.md'}}]}]}));assert.equal(p.tasks.length,1)});
test('reject unknown tool names',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify({tasks:[{id:'a',title:'test',toolCalls:[{name:'shell.exec',args:{command:'echo hello'}}]}]})),/UNSUPPORTED_PLAN_TOOL/));
test('reject malformed JSON',()=>assert.throws(()=>parsePlannerResponse('not json'),/PLAN_JSON_REQUIRED/));
test('reject dependency cycles',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify({tasks:[{id:'a',title:'A',dependsOn:['b']},{id:'b',title:'B',dependsOn:['a']}]})),/CYCLIC_DEPENDENCY/));
