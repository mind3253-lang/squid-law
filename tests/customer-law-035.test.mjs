import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldCheckpointFinalization} from '../api/customer-analysis-worker.js';
test('LAW-035 yields only after a completed finalization round when time budget is reached',()=>{
 assert.equal(shouldCheckpointFinalization({elapsedMs:200000,completedRounds:0}),false);
 assert.equal(shouldCheckpointFinalization({elapsedMs:100000,completedRounds:2}),false);
 assert.equal(shouldCheckpointFinalization({elapsedMs:180000,completedRounds:1}),true);
 assert.throws(()=>shouldCheckpointFinalization({elapsedMs:-1,completedRounds:1}),/INVALID_FINALIZATION_BUDGET/);
});
