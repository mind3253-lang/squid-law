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
test('LAW-033 cron remains five-minute fallback and worker lease is fenced',()=>{
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(vercel.crons.some(x=>x.path==='/api/customer-analysis-worker'&&x.schedule==='*/5 * * * *'));
 const db=readFileSync(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
 assert.match(db,/pg_advisory_xact_lock/);
 assert.match(db,/lease_expires_at>now\(\)/);
 assert.match(db,/errorRetryDelayMs\(job.attempts\)/);
});
