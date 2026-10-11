import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {acquireCustomerLease,renewCustomerLease,advanceCustomerLease,customerLeaseStatus} from '../api/customer-analysis-lease-db.js';
const url=process.env.SQUID_CUSTOMER_DATABASE_URL;
if(!url||!url.includes('localhost'))throw Error('Integration tests require isolated localhost PostgreSQL');
const pool=new Pool({connectionString:url,ssl:false});
const req=()=>randomUUID();
const hash='a'.repeat(64),otherHash='b'.repeat(64);
const user=()=> 'ci-lease-'+randomUUID();
test('schema has composite primary key, status check and expiry index',async()=>{
 const c=await pool.query("SELECT contype,pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='customer_analysis_leases'::regclass");
 assert.ok(c.rows.some(x=>x.contype==='p'&&x.def.includes('customer_key')&&x.def.includes('case_id')&&x.def.includes('request_id')));
 assert.ok(c.rows.some(x=>x.contype==='c'&&x.def.includes('recovery_required')));
 const i=await pool.query("SELECT indexname FROM pg_indexes WHERE tablename='customer_analysis_leases'");
 assert.ok(i.rows.some(x=>x.indexname==='customer_analysis_leases_expiry'));
});
test('acquire, duplicate block, conflict, completion, status',async()=>{
 const u=user(),id=req(),caseId='SL-ci-case';
 const first=await acquireCustomerLease(u,caseId,id,hash);assert.equal(first.kind,'acquired');
 assert.equal((await acquireCustomerLease(u,caseId,id,hash)).kind,'in_progress');
 assert.equal((await acquireCustomerLease(u,caseId,id,otherHash)).kind,'conflict');
 assert.equal(await renewCustomerLease(first,caseId,id),true);
 await advanceCustomerLease(first,caseId,id,'saving','draft_saved');
 await advanceCustomerLease(first,caseId,id,'completed','completed',req());
 assert.equal((await acquireCustomerLease(u,caseId,id,hash)).kind,'completed');
 assert.equal((await customerLeaseStatus(u,caseId,id)).status,'completed');
});
test('concurrent acquisitions have exactly one owner',async()=>{
 const u=user(),id=req(),caseId='SL-ci-race';
 const results=await Promise.all(Array.from({length:6},()=>acquireCustomerLease(u,caseId,id,hash)));
 assert.equal(results.filter(x=>x.kind==='acquired').length,1);
 assert.equal(results.filter(x=>x.kind==='in_progress').length,5);
});
test('expired processing without durable draft enters recovery_required',async()=>{
 const u=user(),id=req(),caseId='SL-ci-recovery';
 const first=await acquireCustomerLease(u,caseId,id,hash);
 await pool.query("UPDATE customer_analysis_leases SET lease_expires_at=now()-interval '1 second' WHERE customer_key=$1 AND case_id=$2 AND request_id=$3",[first.customerKey,caseId,id]);
 assert.equal((await acquireCustomerLease(u,caseId,id,hash,false)).kind,'recovery_required');
 assert.equal((await customerLeaseStatus(u,caseId,id)).status,'recovery_required');
});
test('expired lease with durable draft fences old owner',async()=>{
 const u=user(),id=req(),caseId='SL-ci-fence';
 const first=await acquireCustomerLease(u,caseId,id,hash);
 await pool.query("UPDATE customer_analysis_leases SET lease_expires_at=now()-interval '1 second' WHERE customer_key=$1 AND case_id=$2 AND request_id=$3",[first.customerKey,caseId,id]);
 const next=await acquireCustomerLease(u,caseId,id,hash,true);
 assert.equal(next.kind,'resume_saving');
 assert.ok(BigInt(next.fencingToken)>BigInt(first.fencingToken));
 await assert.rejects(renewCustomerLease(first,caseId,id),/LEASE_LOST/);
 assert.equal(await renewCustomerLease(next,caseId,id),true);
});
test('same request UUID is isolated by customer and case',async()=>{
 const id=req(),u1=user(),u2=user();
 const a=await acquireCustomerLease(u1,'SL-ci-case1',id,hash);
 const b=await acquireCustomerLease(u2,'SL-ci-case1',id,hash);
 const c=await acquireCustomerLease(u1,'SL-ci-case2',id,hash);
 assert.deepEqual([a.kind,b.kind,c.kind],['acquired','acquired','acquired']);
 assert.notEqual(a.customerKey,b.customerKey);
});
test.after(async()=>{await pool.end()});
