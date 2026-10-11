import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
const url=process.env.SQUID_CUSTOMER_DATABASE_URL;
if(!url){console.error('SQUID_CUSTOMER_DATABASE_URL is required; migration not attempted');process.exitCode=2}
else{
 const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:3500,ssl:process.env.SQUID_CUSTOMER_DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  await client.query(readFileSync(new URL('../db/customer-analysis-leases.sql',import.meta.url),'utf8'));
  const check=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customer_analysis_leases'");
  const names=new Set(check.rows.map(r=>r.column_name));
  for(const key of ['customer_key','case_id','request_id','request_hash','owner_token','fencing_token','status','lease_expires_at','last_completed_step','result_id'])if(!names.has(key))throw Error('Missing required column: '+key);
  await client.query('COMMIT');
  console.log('Customer lease schema ready (dedicated customer DB)');
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Customer schema migration failed:',e.message);process.exitCode=1}
 finally{client?.release();await pool.end()}
}
