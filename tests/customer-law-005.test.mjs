import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const db=readFileSync(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../api/customer-analysis-worker.js',import.meta.url),'utf8');
test('LAW-005 resume preserves checkpoint, version and job identity',()=>{
 const sql=db.match(/export async function resumeJob[\s\S]*?(?=export async function queueSnapshot)/)?.[0];
 assert.ok(sql);
 assert.match(sql,/status='queued'/);
 assert.match(sql,/document_version=\$4/);
 assert.match(sql,/status IN \('blocked','failed'\)/);
 assert.doesNotMatch(sql,/checkpoint\s*=/);
 assert.doesNotMatch(sql,/DELETE\s+FROM/i);
 assert.match(worker,/job\.checkpoint/);
});
