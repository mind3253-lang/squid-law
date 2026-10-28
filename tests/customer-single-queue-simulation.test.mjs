import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CUSTOMER_PRODUCT_CONTRACT} from '../lib/customer-product-contract.mjs';

// Simulates atomic PostgreSQL row claims without production credentials.
// Full PostgreSQL multi-instance acceptance remains a separate E2E requirement.
const source=readFileSync(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
const start=source.indexOf('export async function claimJob(){');
const end=source.indexOf('export async function advanceJob(',start);
if(start<0||end<=start)throw Error('CUSTOMER_CLAIM_ENTRY_NOT_FOUND');
const definition=source.slice(start,end)
 .replace('export async function claimJob()','async function claimJob()');

test('simultaneous workers claim different customers, never the same job',async()=>{
 const state={
  released:0,commits:0,
  pending:[
   {job_id:'a',customer_key:'c1',case_id:'case1',fence:1},
   {job_id:'b',customer_key:'c2',case_id:'case2',fence:1}
  ]
 };
 const pool={
  async connect(){
   return {
    async query(sql){
     if(sql==='BEGIN')return {rows:[]};
     if(sql.includes('WITH candidate AS')){
      assert.match(sql,/FOR UPDATE SKIP LOCKED LIMIT 1/);
      assert.match(sql,/fence=fence\+1/);
      // A claim removes one row atomically, as SKIP LOCKED does in PostgreSQL.
      await Promise.resolve();
      const claimed=state.pending.shift()||null;
      return {rows:claimed?[claimed]:[]};
     }
     if(sql==='COMMIT'||sql==='ROLLBACK'){
      if(sql==='COMMIT')state.commits++;
      return {rows:[]};
     }
     throw Error('UNEXPECTED_SQL '+sql.slice(0,100));
    },
    release(){state.released++}
   };
  }
 };
 const claim=new Function('withLeaseDb',
  'randomUUID','publicJob',definition+'\nreturn claimJob;')(
   async callback=>callback(pool),
   ()=>'test-owner',
   row=>({jobId:row.job_id,caseId:row.case_id})
  );
 const claimed=await Promise.all([claim(),claim(),claim()]);
 assert.deepEqual(claimed.filter(Boolean).map(x=>x.jobId).sort(),['a','b']);
 assert.equal(claimed.filter(x=>x===null).length,1);
 assert.equal(state.pending.length,0);
 assert.equal(state.released,3);
 assert.equal(state.commits,3);
});
