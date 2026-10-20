import test from 'node:test';
import assert from 'node:assert/strict';
import {createGabiaJobStore} from '../server/gabia-customer-jobs.mjs';
const caseId='11111111-1111-4111-8111-111111111111';
const documentVersion='a'.repeat(64);
test('analysis job cannot enqueue unregistered PDF',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{calls.push({sql,args});return {rowCount:0,rows:[]}}};
 const store=createGabiaJobStore(pool);
 await assert.rejects(store.enqueue({subject:'customer-1',caseId,documentVersion}),/DOCUMENT_NOT_REGISTERED/);
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/gabia_documents/);
});
test('registered PDF may enqueue after owner check',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{calls.push(sql);return calls.length===1?{rowCount:1,rows:[{one:1}]}:{rowCount:1,rows:[{job_id:'ok'}]}}};
 const store=createGabiaJobStore(pool);
 assert.equal((await store.enqueue({subject:'customer-1',caseId,documentVersion})).job_id,'ok');
 assert.equal(calls.length,2);
});
