import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CUSTOMER_PRODUCT_CONTRACT} from '../lib/customer-product-contract.mjs';

// Simulates the DB transaction/lock protocol without production credentials.
// Full PostgreSQL multi-instance acceptance remains a separate E2E requirement.
const source=readFileSync(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
const start=source.indexOf('export async function claimJob(){');
const end=source.indexOf('export async function advanceJob(',start);
if(start<0||end<=start)throw Error('CUSTOMER_CLAIM_ENTRY_NOT_FOUND');
const definition=source.slice(start,end)
 .replace('export async function claimJob()','async function claimJob()');

test('simultaneous customer workers cannot claim two different active customers',async()=>{
 const state={
  active:null,held:false,waiters:[],released:0,
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
     if(sql.includes('pg_advisory_xact_lock')){
      if(state.held)await new Promise(done=>state.waiters.push(done));
      else state.held=true;
      return {rows:[]};
     }
     if(sql.includes('SELECT 1 FROM customer_analysis_jobs')){
      return {rows:state.active?[{job_id:state.active.job_id}]:[]};
     }
     if(sql.includes('WITH candidate AS')){
      state.active=state.pending.shift()||null;
      return {rows:state.active?[state.active]:[]};
     }
     if(sql==='COMMIT'||sql==='ROLLBACK'){
      const next=state.waiters.shift();
      if(next)next();else state.held=false;
      return {rows:[]};
     }
     throw Error('UNEXPECTED_SQL '+sql.slice(0,100));
    },
    release(){state.released++}
   };
  }
 };
 const claim=new Function('withLeaseDb','CUSTOMER_PRODUCT_CONTRACT',
  'randomUUID','publicJob',definition+'\nreturn claimJob;')(
   async callback=>callback(pool),
   CUSTOMER_PRODUCT_CONTRACT,()=>'test-owner',
   row=>({jobId:row.job_id,caseId:row.case_id})
  );
 const [first,second]=await Promise.all([claim(),claim()]);
 assert.equal([first,second].filter(Boolean).length,1);
 assert.equal(state.pending.length,1);
 assert.equal(state.released,2);
 // A completed job releases the global lane for the next waiting customer.
 state.active=null;
 const next=await claim();
 assert.equal(next.jobId,'b');
 assert.equal(state.pending.length,0);
});
