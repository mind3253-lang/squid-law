import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
const url=process.env.SQUID_CUSTOMER_DATABASE_URL||process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL;
if(!url){console.error('SQUID_CUSTOMER_DATABASE_URL is required; migration not attempted');process.exitCode=2}
else{
 const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:3500,ssl:process.env.SQUID_CUSTOMER_DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  await client.query(readFileSync(new URL('../db/customer-analysis-leases.sql',import.meta.url),'utf8'));
  await client.query(readFileSync(new URL('../db/customer-analysis-jobs.sql',import.meta.url),'utf8'));
  const ping=await client.query('SELECT 1 AS healthy');
  if(ping.rows[0]?.healthy!==1)throw Error('Database ping failed');
  const check=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customer_analysis_leases'");
  const names=new Set(check.rows.map(r=>r.column_name));
  for(const key of ['customer_key','case_id','request_id','request_hash','owner_token','fencing_token','status','lease_expires_at','attempt','last_completed_step','result_id','created_at','updated_at'])if(!names.has(key))throw Error('Missing required column: '+key);
  const constraints=await client.query("SELECT contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='customer_analysis_leases'::regclass");
  if(!constraints.rows.some(x=>x.contype==='p'&&x.definition.includes('customer_key')&&x.definition.includes('case_id')&&x.definition.includes('request_id')))throw Error('Lease primary key missing');
  if(!constraints.rows.some(x=>x.contype==='c'&&x.definition.includes('recovery_required')))throw Error('Lease status constraint missing');
  const index=await client.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename='customer_analysis_leases'");
  if(!index.rows.some(x=>x.indexname==='customer_analysis_leases_expiry'))throw Error('Lease expiry index missing');
  const jobCheck=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customer_analysis_jobs'");
  const jobColumns=new Set(jobCheck.rows.map(r=>r.column_name));
  for(const key of ['customer_key','case_id','job_id','document_version','status','stage','checkpoint','owner_token','fence','lease_expires_at','next_run_at'])if(!jobColumns.has(key))throw Error('Missing job column: '+key);
  await client.query('COMMIT');
  console.log('Customer lease schema ready (dedicated customer DB)');
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Customer schema migration failed:',e.message);process.exitCode=1}
 finally{client?.release();await pool.end()}
}
