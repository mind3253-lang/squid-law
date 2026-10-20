import test from 'node:test';
import assert from 'node:assert/strict';
import {gabiaQueueDecision,gabiaQueueOrder} from '../lib/gabia-queue-policy.mjs';
import {gabiaClaimSql,gabiaCheckpointSql,gabiaExpireSql} from '../server/gabia-queue-sql.mjs';
import {gabiaReportAccess} from '../lib/gabia-customer-report-policy.mjs';
test('FIFO sorts by createdAt then jobId',()=>{
 const items=gabiaQueueOrder([{createdAt:'2026-01-01',jobId:'b'},{createdAt:'2026-01-01',jobId:'a'}]);
 assert.deepEqual(items.map(x=>x.jobId),['a','b']);
});
test('expired jobs have bounded recovery',()=>{
 assert.equal(gabiaQueueDecision({status:'running',attempts:1,maxAttempts:3,leaseExpired:true}),'recover');
 assert.equal(gabiaQueueDecision({status:'running',attempts:3,maxAttempts:3,leaseExpired:true}),'failed');
});
test('SQL fences checkpoint writes',()=>{
 assert.match(gabiaClaimSql,/SKIP LOCKED/);
 assert.match(gabiaCheckpointSql,/fencing_token=\$5/);
});
test('unverified report remains inaccessible',()=>{
 assert.equal(gabiaReportAccess({status:'draft',findings:[]}).ready,false);
});

test('retry jobs are claimable and exhausted leases are terminal',()=>{
 assert.match(gabiaClaimSql,/status IN \('queued','retry'\)/);
 assert.match(gabiaExpireSql,/QUEUE_RETRIES_EXHAUSTED/);
});
