import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withLeaseDb,acquireCustomerLease} from '../api/customer-analysis-lease-db.js';
import {validRequestId,requestHash} from '../api/customer-request-state.js';

test('missing customer PostgreSQL URL fails closed',async()=>{
 const original=process.env.SQUID_CUSTOMER_DATABASE_URL;
 delete process.env.SQUID_CUSTOMER_DATABASE_URL;
 try{
  await assert.rejects(withLeaseDb(async()=>true),e=>e.code==='LEASE_UNAVAILABLE');
  await assert.rejects(acquireCustomerLease('user','SL-case123','123e4567-e89b-42d3-a456-426614174000','0'.repeat(64)),e=>e.code==='LEASE_UNAVAILABLE');
 }finally{if(original===undefined)delete process.env.SQUID_CUSTOMER_DATABASE_URL;else process.env.SQUID_CUSTOMER_DATABASE_URL=original}
});
test('request IDs and hashes reject accidental input reuse',()=>{
 assert.equal(validRequestId('123e4567-e89b-42d3-a456-426614174000'),true);
 assert.equal(validRequestId('../bad'),false);
 assert.notEqual(requestHash('SL-case123',[{role:'user',content:'A'}]),requestHash('SL-case123',[{role:'user',content:'B'}]));
});
test('schema has durable request uniqueness and fencing',()=>{
 const sql=readFileSync(new URL('../db/customer-analysis-leases.sql',import.meta.url),'utf8');
 assert.match(sql,/PRIMARY KEY\s*\(customer_key,case_id,request_id\)/i);
 assert.match(sql,/fencing_token\s+bigint/i);
 assert.match(sql,/recovery_required/);
});

test('customer status API requires the configured Gabia database',()=>{
 const src=readFileSync(new URL('../api/customer-analysis-status.js',import.meta.url),'utf8');
 assert.match(src,/process\.env\.SQUID_CUSTOMER_DATABASE_URL/);
 assert.doesNotMatch(src,/SQUID_CUSTOMER_DATABASE_DATABASE_URL/);
 assert.match(src,/customerLeaseStatus\\(auth\\.user,caseId,requestId\\)/);
});
test('all customer lease entrypoints use the single database configuration',()=>{
 for(const file of ['customer-analysis.js','customer-analysis-status.js','customer-analysis-lease-db.js']){
  const src=readFileSync(new URL('../api/'+file,import.meta.url),'utf8');
  assert.match(src,/SQUID_CUSTOMER_DATABASE_URL/,file);
  assert.doesNotMatch(src,/SQUID_CUSTOMER_DATABASE_DATABASE_URL/,file);
 }
 const migrate=readFileSync(new URL('../scripts/customer-db-migrate.mjs',import.meta.url),'utf8');
 assert.match(migrate,/SQUID_CUSTOMER_DATABASE_URL/);
 assert.doesNotMatch(migrate,/SQUID_CUSTOMER_DATABASE_DATABASE_URL/);
});
