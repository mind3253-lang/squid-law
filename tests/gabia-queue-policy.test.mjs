import test from 'node:test';
import assert from 'node:assert/strict';
import {gabiaQueueOrder,gabiaQueuePosition} from '../server/gabia-queue-policy.mjs';
test('global FIFO is stable under same timestamp',()=>{
 const created_at='2026-10-19T00:00:00Z';
 const rows=[{job_id:'b',status:'queued',created_at},{job_id:'a',status:'running',created_at},{job_id:'c',status:'completed',created_at}];
 assert.deepEqual(gabiaQueueOrder(rows).map(x=>x.job_id),['a','b']);
 assert.equal(gabiaQueuePosition(rows,'b'),2);
 assert.equal(gabiaQueuePosition(rows,'c'),null);
});
