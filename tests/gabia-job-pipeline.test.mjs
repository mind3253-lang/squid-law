import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGabiaJobPdf} from '../server/gabia-job-pdf.mjs';
import {completeGabiaJob,gabiaCompleteJobSql} from '../server/gabia-job-result.mjs';
test('missing registered PDF prevents claimed job input',async()=>{
 const pool={query:async()=>({rowCount:0,rows:[]})};
 await assert.rejects(loadGabiaJobPdf({pool,root:'/tmp/unused',job:{customer_key:'a'.repeat(64),case_id:'11111111-1111-4111-8111-111111111111',document_version:'b'.repeat(64)}}),/GABIA_JOB_DOCUMENT_MISSING/);
});
test('report completion requires verification and current lease',async()=>{
 const pool={query:async()=>({rowCount:0,rows:[]})};
 const job={customer_key:'a'.repeat(64),case_id:'11111111-1111-4111-8111-111111111111',job_id:'22222222-2222-4222-8222-222222222222',fencing_token:1};
 const args={job,workerId:'worker-01',resultPath:'reports/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.json'};
 await assert.rejects(completeGabiaJob(pool,args),/UNVERIFIED_GABIA_RESULT/);
 await assert.rejects(completeGabiaJob(pool,{...args,verified:true}),/QUEUE_LEASE_LOST/);
 assert.match(gabiaCompleteJobSql,/fencing_token=\$5/);
});
