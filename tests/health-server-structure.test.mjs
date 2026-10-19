import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../server/health-server.mjs',import.meta.url),'utf8');
const unit=readFileSync(new URL('../deploy/squidlaw-health.service',import.meta.url),'utf8');
test('health server does not run customer analysis or import database',()=>{
 assert.doesNotMatch(src,/claimJob|advanceJob|customer-analysis-worker|@vercel\/blob|\bpg\b/);
 assert.match(src,/127\.0\.0\.1/);
 assert.match(src,/analysisExecuted:false/);
});
test('health endpoint is loopback only by default',()=>{
 assert.match(unit,/SQUIDLAW_HEALTH_HOST=127\.0\.0\.1/);
 assert.doesNotMatch(unit,/ExecStart=.*continuous-worker/);
});
