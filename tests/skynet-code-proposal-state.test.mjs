import test from 'node:test';import assert from 'node:assert/strict';
import {stageCodeProposal,approvedCodeProposal,codeProposalReceipt} from '../lib/skynet-code-proposal-state.mjs';
const sha='a'.repeat(40);const args={owner:'acme',repo:'demo',path:'src/a.js',branch:'main',sha,content:'export default 1',message:'Update code'};
const job=()=>({id:'job-12345678',owner:'worker',status:'running',scopes:['repository:read','repository:write'],writeTargets:{repository:'acme/demo',branch:'main'},tasks:[{id:'task',status:'in_progress'}]});
test('stage exact-target proposal',()=>{const next=stageCodeProposal(job(),{taskId:'task',proposal:{tool:'github.commit',args}});assert.equal(next.codeProposal.status,'pending_approval');assert.equal(next.codeProposal.step,1)});
test('write cannot run before persisted approval',()=>{const next=stageCodeProposal(job(),{taskId:'task',proposal:{tool:'github.commit',args}});assert.throws(()=>approvedCodeProposal(next),/APPROVAL_REQUIRED/)});
test('approval uses original immutable operation arguments',()=>{const next=stageCodeProposal(job(),{taskId:'task',proposal:{tool:'github.commit',args}});next.approvals=[{operationKey:next.codeProposal.key,approved:true}];assert.equal(approvedCodeProposal(next).args.sha,sha)});
test('receipt needs completed operation',()=>{const next=stageCodeProposal(job(),{taskId:'task',proposal:{tool:'github.commit',args}});assert.throws(()=>codeProposalReceipt(next,next.codeProposal.key,{sha}),/WRITE_NOT_COMPLETED/)});
