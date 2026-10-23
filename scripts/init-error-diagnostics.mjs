// Run once in the deployment environment: node scripts/init-error-diagnostics.mjs
// Requires SQUID_CUSTOMER_DATABASE_URL (or legacy SQUID_CUSTOMER_DATABASE_DATABASE_URL).
// Does not read or change customer reports, jobs, payment or evidence data.
import {readFile} from 'node:fs/promises';
import {withLeaseDb} from '../api/customer-analysis-lease-db.js';
const sql=await readFile(new URL('../sql/squid_error_diagnostics.sql',import.meta.url),'utf8');
try{
 await withLeaseDb(async db=>{
  await db.query(sql);
  const {rows}=await db.query("SELECT to_regclass('public.squid_error_diagnostics') IS NOT NULL AS exists");
  if(!rows[0]?.exists)throw Error('DIAGNOSTIC_SCHEMA_MISSING');
 });
 console.log('DIAGNOSTIC_SCHEMA_READY');
}catch(e){console.error('DIAGNOSTIC_SCHEMA_INIT_FAILED',String(e?.code||e?.message||'UNKNOWN').slice(0,120));process.exitCode=1}
