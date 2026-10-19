import test from 'node:test';
import assert from 'node:assert/strict';
import {customerWorkerOwner,mayClaimCustomerJob,shouldDispatchCustomerWorker} from '../lib/customer-worker-owner.mjs';
test('default remains Vercel',()=>{
 const e={};assert.equal(customerWorkerOwner(e),'vercel');
 assert.equal(mayClaimCustomerJob(e),true);
 assert.equal(shouldDispatchCustomerWorker(e),true);
});
test('Vercel cannot claim or redispatch after its owner flag switches',()=>{
 const e={SQUIDLAW_CUSTOMER_WORKER_OWNER:'gabia'};
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
test('Vercel remains owner if malformed value provided',()=>{
 const e={SQUIDLAW_CUSTOMER_WORKER_OWNER:'gabiA'};
 assert.equal(customerWorkerOwner(e),'vercel');
});
