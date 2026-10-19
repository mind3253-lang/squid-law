import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../worker/continuous-worker.mjs',import.meta.url),'utf8');
test('cycle metrics are opt-in and contain no customer identifiers',()=>{
 assert.match(src,/SQUIDLAW_ANALYSIS_TIMING==='1'/);
 assert.match(src,/ANALYSIS_WORKER_CYCLE/);
 assert.match(src,/JSON\.stringify\(\{outcome,kind,elapsedMs\}\)/);
 assert.doesNotMatch(src,/ANALYSIS_WORKER_CYCLE.*jobId/);
});
test('approval gates precede worker import and loop',()=>{
 assert.ok(src.indexOf("SQUIDLAW_WORKER_RUN_APPROVED")<src.indexOf("await import('../api/customer-analysis-worker.js')"));
 assert.ok(src.indexOf("SQUIDLAW_WORKER_CUTOVER_APPROVED")<src.indexOf("await import('../api/customer-analysis-worker.js')"));
});
