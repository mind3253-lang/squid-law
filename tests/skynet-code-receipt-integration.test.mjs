import test from 'node:test';
import assert from 'node:assert/strict';
import {stageCodeProposal,codeProposalReceipt} from '../lib/skynet-code-proposal-state.mjs';
import {reconcileCommittedProposal} from '../lib/skynet-code-proposal-reconcile.mjs';
import {verifyCommittedCode} from '../lib/skynet-code-proposal-verify.mjs';
const sourceSha='a'.repeat(40),commitSha='b'.repeat(40);
const args={owner:'example',repo:'app',path:'lib/index.js',branch:'main',sha:sourceSha,content:'export default 2;',message:'Update index'};
const job={id:'example-job',status:'running',scopes:['repository:write'],writeTargets:{repository:'example/app',branch:'main'},tasks:[{id:'code',kind:'coding',status:'in_progress'}],operations:{}};
test('real write executor receipt sha reconciles and verifies code task',()=>{
 const staged=stageCodeProposal(job,{taskId:'code',proposal:{tool:'github.commit',args}});
 const key=staged.codeProposal.key;
 const withReceipt={...staged,operations:{[key]:{status:'completed',result:{ok:true,sha:commitSha,contentSha:sourceSha}}}};
 const reconciled=reconcileCommittedProposal(withReceipt);
 assert.equal(reconciled.codeProposal.commitSha,commitSha);
 assert.deepEqual(reconciled.tasks[0].evidence,['commit:'+commitSha]);
 assert.equal(verifyCommittedCode(reconciled,'code').tasks[0].status,'verified');
});
test('a failed write receipt cannot become verified code evidence',()=>{
 const staged=stageCodeProposal(job,{taskId:'code',proposal:{tool:'github.commit',args}});
 const key=staged.codeProposal.key;
 assert.throws(()=>reconcileCommittedProposal({...staged,operations:{[key]:{status:'completed',result:{ok:false,sha:commitSha}}}}),/COMMIT_SHA_REQUIRED/);
});
