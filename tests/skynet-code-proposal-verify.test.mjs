import test from 'node:test';import assert from 'node:assert/strict';import {verifyCommittedCode} from '../lib/skynet-code-proposal-verify.mjs';
const sha='a'.repeat(40);const job={codeProposal:{status:'committed',taskId:'task',commitSha:sha,key:'receipt-key'},operations:{'receipt-key':{status:'completed',result:{ok:true,sha}}},tasks:[{id:'task',status:'implemented',evidence:['commit:'+sha]}]};
test('committed code task verifies with matching evidence',()=>assert.equal(verifyCommittedCode(job,'task').tasks[0].status,'verified'));
test('uncommitted proposal cannot verify',()=>assert.throws(()=>verifyCommittedCode({...job,codeProposal:{...job.codeProposal,status:'pending_approval'}},'task'),/COMMIT_EVIDENCE_REQUIRED/));
