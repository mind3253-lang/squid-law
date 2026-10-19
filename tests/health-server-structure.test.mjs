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

test('diagnostics expose operational metrics without customer records or secrets',()=>{
 assert.match(src,/\/diagnostics/);
 assert.match(src,/HEALTH_DIAGNOSTICS_LOOPBACK_ONLY/);
 assert.match(src,/uptimeSeconds/);
 assert.match(src,/memoryMiB/);
 assert.match(src,/DIAGNOSTICS_UNAVAILABLE/);
 assert.doesNotMatch(src,/process\.env\)|JSON\.stringify\(process\.env\)|customerKey|apiKey|OPENAI_API_KEY/);
});
