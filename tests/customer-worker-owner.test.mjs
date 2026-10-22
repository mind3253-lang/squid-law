import test from 'node:test';
import assert from 'node:assert/strict';
import {customerWorkerOwner,mayClaimCustomerJob,shouldDispatchCustomerWorker} from '../lib/customer-worker-owner.mjs';
test('Gabia remains the sole owner by default',()=>{
 const e={};assert.equal(customerWorkerOwner(e),'gabia');
 assert.equal(mayClaimCustomerJob(e),false);
 assert.equal(shouldDispatchCustomerWorker(e),false);
});
test('legacy Vercel owner flag cannot reclaim work after cutover',()=>{
 const e={SQUIDLAW_CUSTOMER_WORKER_OWNER:'vercel'};
 assert.equal(customerWorkerOwner(e),'gabia');
 assert.equal(mayClaimCustomerJob(e),false);
 assert.equal(shouldDispatchCustomerWorker(e),false);
});
test('Gabia requires approvals and its own process flag',()=>{
 const e={SQUIDLAW_CUSTOMER_WORKER_OWNER:'gabia',SQUIDLAW_CONTINUOUS_WORKER:'1'};
 assert.equal(mayClaimCustomerJob(e),false);
 e.SQUIDLAW_WORKER_RUN_APPROVED='YES';assert.equal(mayClaimCustomerJob(e),false);
 e.SQUIDLAW_WORKER_CUTOVER_APPROVED='YES';assert.equal(mayClaimCustomerJob(e),true);
 assert.equal(shouldDispatchCustomerWorker(e),false);
});
test('malformed legacy owner flag cannot override Gabia',()=>{
 const e={SQUIDLAW_CUSTOMER_WORKER_OWNER:'gabiA'};
 assert.equal(customerWorkerOwner(e),'gabia');
});
