import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workerFailureDelayMs} from '../lib/gabia-worker-backoff.mjs';
test('worker failures use bounded exponential delay',()=>{
 assert.deepEqual([0,1,2,3,4,5,6,30].map(workerFailureDelayMs),[0,1000,2000,4000,8000,16000,30000,30000]);
 assert.throws(()=>workerFailureDelayMs(-1),/INVALID_FAILURE_COUNT/);
});
