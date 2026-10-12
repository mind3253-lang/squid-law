import test from 'node:test';
import assert from 'node:assert/strict';
import {operationKey} from '../lib/skynet-job-state.mjs';
import {taskToolRequest} from '../lib/skynet-worker-task-dispatch.mjs';
import {checkpointTask} from '../lib/skynet-worker-core.mjs';
import {registerOperation,finishOperation} from '../lib/skynet-worker-operations.mjs';
import {verificationGate} from '../lib/skynet-worker-verification-gate.mjs';

test('separate tasks do not share identical tool operation keys',()=>{
 const taskA={id:'alpha',toolCalls:[{name:'github.read',args:{path:'README.md'}}]};
 const taskB={id:'beta',toolCalls:[{name:'github.read',args:{path:'README.md'}}]};
 const job={id:'job-12345678',operations:{}};
 const a=taskToolRequest(job,taskA),b=taskToolRequest(job,taskB);
 assert.notEqual(a.key,b.key);
 assert.equal(a.key,operationKey(job.id,a.step,a.tool,a.args));
});
test('completed operation cannot be completed twice',()=>{
 const job={id:'job-12345678',operations:{}};
 const registered=registerOperation(job,0,'github.read',{path:'README.md'});
 const done=finishOperation(registered.job,registered.key,{ok:true});
 assert.throws(()=>finishOperation(done,registered.key,{ok:true}),/OPERATION_NOT_PENDING/);
});
test('verified tasks require implementation evidence',()=>{
 assert.equal(verificationGate({status:'implemented',evidence:['commit']}).allowed,true);
 assert.equal(verificationGate({status:'implemented',evidence:[]}).allowed,false);
});
test('task cannot skip implementation and mark verified',()=>{
 const job={id:'job-12345678',tasks:[{id:'alpha',status:'todo',dependsOn:[]}]};
 assert.throws(()=>checkpointTask(job,'alpha',{status:'verified',evidence:['x']}),/TASK_NOT_IMPLEMENTED/);
});
test('task tool plan is immutable at checkpoint',()=>{
 const job={id:'job-12345678',tasks:[{id:'alpha',status:'todo',dependsOn:[]}]};
 assert.throws(()=>checkpointTask(job,'alpha',{toolCalls:[]}),/INVALID_TASK_PATCH/);
});
