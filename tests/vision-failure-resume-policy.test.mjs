import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('vision validation errors are blocked rather than repeatedly retried',async()=>{
 const worker=await readFile(new URL('../api/customer-analysis-worker.js',import.meta.url),'utf8');
 assert.match(worker,/visionFailureDisposition\(safeCode/);
 assert.match(worker,/visionPageDiagnostic/);
});
test('resume does not clear unchanged vision failure checkpoints',async()=>{
 const jobs=await readFile(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
 assert.match(jobs,/error_code NOT LIKE 'VISION_PDF_%'/);
});
