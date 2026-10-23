// Run once in the deployment environment: node scripts/init-error-diagnostics.mjs
// Requires SQUID_CUSTOMER_DATABASE_URL (or legacy SQUID_CUSTOMER_DATABASE_DATABASE_URL).
// Does not read or change customer reports, jobs, payment or evidence data.
import {readFile} from 'node:fs/promises';
import {withLeaseDb} from '../api/customer-analysis-lease-db.js';
const sql=await readFile(new URL('../sql/squid_error_diagnostics.sql',import.meta.url),'utf8');
try{
 await withLeaseDb(async db=>{
  await db.query(sql);
  const {rows}=await db.query("SELECT to_regclass('squid_error_diagnostics') IS NOT NULL AS exists");
  if(!rows[0]?.exists)throw Error('DIAGNOSTIC_SCHEMA_MISSING');
  // Verify the application can write without leaving synthetic error records behind.
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   await client.query("INSERT INTO squid_error_diagnostics(trace_id,system,operation,code) VALUES($1,'SYSTEM','schema-check','SCHEMA_WRITE_TEST')",['ERR-schema-check-'+process.pid]);
   const check=await client.query('SELECT trace_id FROM squid_error_diagnostics WHERE trace_id=$1',['ERR-schema-check-'+process.pid]);
   if(check.rowCount!==1)throw Error('DIAGNOSTIC_WRITE_VERIFY_FAILED');
  }finally{await client.query('ROLLBACK');client.release()}
  console.log('DIAGNOSTIC_SCHEMA_WRITE_READ_OK');
 });
 console.log('DIAGNOSTIC_SCHEMA_READY');
}catch(e){console.error('DIAGNOSTIC_SCHEMA_INIT_FAILED',String(e?.code||e?.message||'UNKNOWN').slice(0,120));process.exitCode=1}
