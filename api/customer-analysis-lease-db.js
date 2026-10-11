import {createHash,randomUUID} from 'node:crypto';
import {LeaseUnavailable} from './customer-analysis-lease.js';
const customerKey=user=>createHash('sha256').update(user).digest('hex');
const db=async()=>{if(!process.env.SQUID_CUSTOMER_DATABASE_URL)throw new LeaseUnavailable();const {Pool}=await import('pg');return new Pool({connectionString:process.env.SQUID_CUSTOMER_DATABASE_URL,max:2,connectionTimeoutMillis:3500,ssl:process.env.SQUID_CUSTOMER_DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}})};
export async function withLeaseDb(fn){const pool=await db();try{return await fn(pool)}finally{await pool.end()}}
export async function acquireCustomerLease(user,caseId,requestId,requestHash){
 return withLeaseDb(async pool=>{
  const ownerToken=randomUUID(),key=customerKey(user);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('INSERT INTO customer_analysis_leases(customer_key,case_id,request_id,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[key,caseId,requestId,requestHash]);
   const {rows}=await client.query('SELECT * FROM customer_analysis_leases WHERE customer_key=$1 AND case_id=$2 AND request_id=$3 FOR UPDATE',[key,caseId,requestId]);
   const row=rows[0];if(!row)throw Error('REQUEST_MISSING');
   if(row.request_hash!==requestHash){await client.query('COMMIT');return {kind:'conflict'}}
   if(row.status==='completed'){await client.query('COMMIT');return {kind:'completed',resultId:row.result_id}}
   if(row.status==='recovery_required'){await client.query('COMMIT');return {kind:'recovery_required',status:row.status}}
   if(row.status==='processing'||row.status==='saving'){
    if(row.lease_expires_at&&new Date(row.lease_expires_at)<=new Date()&&row.status==='saving'){
     const renewed=await client.query("UPDATE customer_analysis_leases SET owner_token=$4,fencing_token=fencing_token+1,lease_expires_at=now()+interval '120 seconds',updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND request_id=$3 RETURNING fencing_token",[key,caseId,requestId,ownerToken]);
     await client.query('COMMIT');return {kind:'resume_saving',ownerToken,fencingToken:String(renewed.rows[0].fencing_token),customerKey:key};
    }
    if(row.lease_expires_at&&new Date(row.lease_expires_at)<=new Date()){await client.query("UPDATE customer_analysis_leases SET status='recovery_required',updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND request_id=$3",[key,caseId,requestId]);await client.query('COMMIT');return {kind:'recovery_required',status:'recovery_required'}}
    await client.query('COMMIT');return {kind:'in_progress',status:row.status}
   }
   if(row.attempt>0){await client.query('COMMIT');return {kind:'recovery_required'}}
   const update=await client.query("UPDATE customer_analysis_leases SET owner_token=$4,fencing_token=fencing_token+1,attempt=attempt+1,status='processing',lease_expires_at=now()+interval '120 seconds',updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND request_id=$3 RETURNING fencing_token",[key,caseId,requestId,ownerToken]);
   await client.query('COMMIT');
   return {kind:'acquired',ownerToken,fencingToken:String(update.rows[0].fencing_token),customerKey:key};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
 });
}
export async function renewCustomerLease(lease,caseId,requestId){
 return withLeaseDb(async pool=>{
  const {rowCount}=await pool.query("UPDATE customer_analysis_leases SET lease_expires_at=now()+interval '120 seconds',updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND request_id=$3 AND owner_token=$4 AND fencing_token=$5 AND lease_expires_at>now() AND status IN ('processing','saving')",[lease.customerKey,caseId,requestId,lease.ownerToken,lease.fencingToken]);
  if(rowCount!==1)throw Error('LEASE_LOST');
  return true;
 });
}
export async function advanceCustomerLease(lease,caseId,requestId,status,step,resultId=null){
 return withLeaseDb(async pool=>{
  const {rowCount}=await pool.query("UPDATE customer_analysis_leases SET status=$6,last_completed_step=$7,result_id=COALESCE($8,result_id),lease_expires_at=CASE WHEN $6='completed' THEN NULL ELSE now()+interval '120 seconds' END,updated_at=now() WHERE customer_key=$1 AND case_id=$2 AND request_id=$3 AND owner_token=$4 AND fencing_token=$5 AND lease_expires_at>now() AND status IN ('processing','saving')",[lease.customerKey,caseId,requestId,lease.ownerToken,lease.fencingToken,status,step,resultId]);
  if(rowCount!==1)throw Error('LEASE_LOST');return true;
 });
}
export async function customerLeaseStatus(user,caseId,requestId){return withLeaseDb(async pool=>{const {rows}=await pool.query('SELECT status,last_completed_step,result_id,updated_at FROM customer_analysis_leases WHERE customer_key=$1 AND case_id=$2 AND request_id=$3',[customerKey(user),caseId,requestId]);return rows[0]||null})}
