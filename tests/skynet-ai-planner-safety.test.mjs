import test from 'node:test';import assert from 'node:assert/strict';import {parsePlannerResponse} from '../lib/skynet-ai-planner.mjs';
const task=(extra={})=>({id:'read',title:'Read project entrypoint',dependsOn:[],toolCalls:[{name:'github.read',args:{owner:'acme',repo:'demo',path:'README.md'}}],...extra});
test('generated plans cannot claim tasks already verified',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify({tasks:[task({status:'verified',evidence:['fake']})]})),/GENERATED_TASK_MUST_BE_TODO/));
test('generated plans cannot embed execution evidence',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify({tasks:[task({evidence:['fabricated']})]})),/GENERATED_EVIDENCE_FORBIDDEN/));
test('generated plans cap task count',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify({tasks:Array.from({length:13},(_,i)=>task({id:'t'+i}))})),/PLAN_TASK_LIMIT/));
test('generated plans cannot call shell execution',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify({tasks:[task({toolCalls:[{name:'shell.exec',args:{}}]})]})),/UNSUPPORTED_PLAN_TOOL/));
