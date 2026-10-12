import test from 'node:test';import assert from 'node:assert/strict';
import {stageCodeProposal} from '../lib/skynet-code-proposal-state.mjs';
import {reconcileCommittedProposal} from '../lib/skynet-code-proposal-reconcile.mjs';
const sha='a'.repeat(40),commit='b'.repeat(40);
const base={id:'job-12345678',status:'running',scopes:['repository:write'],writeTargets:{repository:'acme/demo',branch:'main'},tasks:[{id:'task',status:'in_progress'}]};
const args={owner:'acme',repo:'demo',path:'src/a.js',branch:'main',sha,content:'export default 1',message:'Update code'};
test('committed proposal checkpoints implemented with real SHA',()=>{const j=stageCodeProposal(base,{taskId:'task',proposal:{tool:'github.commit',args}});j.operations={[j.codeProposal.key]:{status:'completed',result:{ok:true,sha:commit}}};const result=reconcileCommittedProposal(j);assert.equal(result.tasks[0].status,'implemented');assert.deepEqual(result.tasks[0].evidence,['commit:'+commit]);assert.equal(result.codeProposal.commitSha,commit)});
test('uncertain write never gets implementation credit',()=>{const j=stageCodeProposal(base,{taskId:'task',proposal:{tool:'github.commit',args}});j.operations={[j.codeProposal.key]:{status:'uncertain'}};assert.throws(()=>reconcileCommittedProposal(j),/WRITE_NOT_COMPLETED/)});
