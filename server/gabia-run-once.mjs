// Explicit one-shot Gabia worker, no public port or automatic model billing.
// SQUIDLAW_GABIA_DATABASE_URL, SQUIDLAW_GABIA_PDF_ROOT and
// SQUIDLAW_GABIA_REPORT_ROOT must be configured on the standalone server.
import {Pool} from 'pg';
import {runGabiaPreliminaryJob} from './gabia-preliminary-runner.mjs';
const {SQUIDLAW_GABIA_DATABASE_URL:url,SQUIDLAW_GABIA_PDF_ROOT:storageRoot,SQUIDLAW_GABIA_REPORT_ROOT:reportRoot}=process.env;
if(!url||!storageRoot?.startsWith('/')||!reportRoot?.startsWith('/'))throw Error('GABIA_ONE_SHOT_CONFIG_REQUIRED');
const pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:5000,ssl:process.env.SQUIDLAW_GABIA_DB_LOCAL==='1'?false:{rejectUnauthorized:true}});
try{
 const result=await runGabiaPreliminaryJob({pool,storageRoot,reportRoot,workerId:'gabia-once-'+process.pid});
 process.stdout.write(JSON.stringify(result)+'\n');
}finally{await pool.end()}
