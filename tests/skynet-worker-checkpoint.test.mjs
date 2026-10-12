import test from 'node:test';import assert from 'node:assert/strict';import {checkpointTask} from '../lib/skynet-worker-core.mjs';
const job=(status='implemented')=>({id:'job-12345678',tasks:[{id:'task',status,dependsOn:[],toolCalls:[]}]});
test('verification accepts evidence submitted with checkpoint',()=>{const j=checkpointTask(job(),'task',{status:'verified',evidence:['commit:abc']});assert.equal(j.tasks[0].status,'verified')});
test('verification rejects missing evidence',()=>assert.throws(()=>checkpointTask(job(),'task',{status:'verified'}),/TASK_NOT_IMPLEMENTED|TASK_EVIDENCE_REQUIRED/));
test('task checkpoint cannot rewrite tool calls',()=>assert.throws(()=>checkpointTask(job(),'task',{toolCalls:[]}),/INVALID_TASK_PATCH/));
test('task checkpoint cannot replace task identifier',()=>assert.throws(()=>checkpointTask(job(),'task',{id:'other'}),/INVALID_TASK_PATCH/));
