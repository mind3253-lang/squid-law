import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPersistedCustomerReport} from '../api/customer-analysis-worker.js';
test('LAW-007 verifies report persisted bytes before publishing completed checkpoint',()=>{
 const report={caseId:'SL-case123',sourceVersion:'a'.repeat(64),findings:[{claim:'verified'}]};
 assert.equal(assertPersistedCustomerReport(report,structuredClone(report)),true);
 assert.throws(()=>assertPersistedCustomerReport(report,{...report,findings:[]}),/PERSISTENCE_MISMATCH/);
 assert.throws(()=>assertPersistedCustomerReport(report,null),/PERSISTENCE_MISMATCH/);
});
