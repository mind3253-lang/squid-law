import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../api/customer-analysis-worker.js',import.meta.url),'utf8');
test('database checkpoints and Blob writes use timed wrappers',()=>{
 assert.match(src,/advanceJob as advanceJobRaw/);
 assert.match(src,/put as putRaw/);
 assert.match(src,/timedAnalysisStep\('checkpoint_write',\(\)=>advanceJobRaw\(\.\.\.args\)\)/);
 assert.match(src,/timedAnalysisStep\('blob_write',\(\)=>putRaw\(\.\.\.args\)\)/);
});
test('original customer worker does not emit document paths in timing labels',()=>{
 const timing=readFileSync(new URL('../lib/analysis-timing.mjs',import.meta.url),'utf8');
 assert.match(timing,/SQUIDLAW_ANALYSIS_TIMING/);
 assert.doesNotMatch(timing,/JSON\.stringify\(.*(?:args|path|documentId)/);
});
