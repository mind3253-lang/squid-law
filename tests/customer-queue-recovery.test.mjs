import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('latest job recovery is case and customer scoped',()=>{
 const db=source('api/customer-analysis-jobs-db.js');
 const api=source('api/customer-analysis-job.js');
 assert.match(db,/export async function latestCaseJob\(user,caseId\)/);
 assert.match(db,/WHERE customer_key=\$1 AND case_id=\$2 ORDER BY created_at DESC,job_id DESC LIMIT 1/);
 assert.match(api,/jobId==='latest'\?await latestCaseJob\(a\.user,caseId\)/);
 assert.match(api,/queueSnapshot\(a\.user,caseId,job\.jobId\)/);
});
test('global queue excludes stale running leases and counts the active job in ETA',()=>{
 const db=source('api/customer-analysis-jobs-db.js');
 const snapshot=db.slice(db.indexOf('export async function queueSnapshot('));
 assert.match(snapshot,/status='running' AND lease_expires_at>now\(\)/);
 assert.match(snapshot,/Math\.ceil\(\(v\.ahead\+Math\.max\(0,v\.active-v\.running_ahead\)\)\*v\.avg_seconds\)/);
 assert.match(snapshot,/v\.completed>=3/);
});
test('client can recover latest job after browser session storage is cleared',()=>{
 const ui=source('customer.html');
 assert.match(ui,/jobId=latest/);
 assert.match(ui,/sessionStorage\.setItem\('squidlaw-full-review:'/);
});
test('verified-page billing metadata never implies authorized payment',()=>{
 const api=source('api/customer-analysis-job.js');
 assert.match(api,/unit:'verified_source_page'/);
 assert.match(api,/pageCountVerified:verifiedSourcePages\(allDocs\)/);
 assert.match(api,/priceConfirmed:false,chargeAuthorized:false/);
});

test('FIFO waiting count excludes retry jobs whose backoff has not elapsed',()=>{
 const db=source('api/customer-analysis-jobs-db.js');
 const q=db.slice(db.indexOf('export async function queueSnapshot('));
 assert.match(q,/status IN \('queued','retry'\) AND next_run_at<=now\(\)/);
});

test('backoff retries are not shown as immediately executable',()=>{
 const db=source('api/customer-analysis-jobs-db.js');
 assert.match(db,/\(next_run_at<=now\(\)\) AS ready_now/);
 assert.match(db,/const eligible=waiting&&t\.ready_now===true/);
 assert.match(db,/position:eligible\?v\.ahead\+1:null/);
 assert.match(db,/retryBackoff:waiting&&!eligible/);
});
