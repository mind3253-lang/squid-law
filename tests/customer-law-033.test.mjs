import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {errorRetryDelayMs,shouldPromptlyRedispatch} from '../lib/customer-worker-retry.mjs';
test('LAW-033 retry nudge runs AFTER persisted SQL backoff',()=>{
 for(let attempts=0;attempts<4;attempts++){
  assert.equal(shouldPromptlyRedispatch(attempts),true);
  assert.ok(errorRetryDelayMs(attempts)>2**attempts*1000);
 }
 assert.equal(shouldPromptlyRedispatch(4),false);
});
test('LAW-033 Gabia continuous worker retains fenced SQL lease and bounded retries',()=>{
 const worker=readFileSync(new URL('../worker/continuous-worker.mjs',import.meta.url),'utf8');
 assert.match(worker,/workerPreflight\(\)/);
 assert.match(worker,/await handler\(req,res\)/);
 assert.match(worker,/workerFailureDelayMs\(consecutiveFailures\)/);
 const db=readFileSync(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
 assert.match(db,/pg_advisory_xact_lock/);
 assert.match(db,/lease_expires_at>now\(\)/);
 assert.match(db,/lease_expires_at>now\(\)/);
});
