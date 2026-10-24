#!/usr/bin/env node
// Read-only production integration audit. Never prints credentials or customer data.
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {connect} from 'node:net';
const root=process.cwd(),checks=[];
function check(name,ok,detail=''){checks.push({name,ok:Boolean(ok),detail});}
async function exists(p){try{return (await stat(p)).isFile()}catch{return false}}
async function walk(dir,out=[]){
 for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
  if(['node_modules','.git','.next','dist','build'].includes(e.name))continue;
  const f=path.join(dir,e.name);
  if(e.isDirectory())await walk(f,out);
  else if(/\.(mjs|js|json|html|service|yml|yaml)$/.test(e.name))out.push(f);
 }
 return out;
}
for(const f of ['server/gabia-api-compat.mjs','server/gabia-static-web.mjs','api/customer-analysis-job.js','api/customer-analysis-worker.js','api/customer-cases.js','lib/customer-object-storage.mjs','worker/continuous-worker.mjs']){
 check('source:'+f,await exists(path.join(root,f)));
}
const sources=await walk(root);
const old=[];
for(const f of sources){
 if(f.includes('/docs/')||f.includes('/tests/')||f.includes('/.github/')||f.includes('/deploy/')||f.includes('/scripts/'))continue;
 const s=await readFile(f,'utf8').catch(()=>'');
 if(/(vercel\.com|vercel\.app|@vercel\/blob|neon\.tech|DATABASE_URL_NEON)/i.test(s))old.push(path.relative(root,f));
}
check('legacy-runtime-reference-scan',old.length===0,'files='+old.length+(old.length?' '+old.slice(0,15).join(','):''));
const port=Number(process.env.SQUIDLAW_AUDIT_API_PORT||3084);
async function request(url){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual'});return {status:r.status,ct:r.headers.get('content-type')||''}}
 catch(e){return {error:e?.cause?.code||e?.name||'FETCH_ERROR'}}
}
for(const [name,uri] of [['api-auth','/api/customer-auth'],['analysis-status-route','/api/customer-analysis-job?caseId=SL-AUDIT-NOT-REAL&jobId=latest'],['case-list-route','/api/customer-cases']]){
 const r=await request('http://127.0.0.1:'+port+uri);
 // Unauthorized JSON is expected for an unauthenticated request; HTML 404 is a routing fault.
 check(name,(name==='api-auth'?[200,400,401,403].includes(r.status):[400,401,403].includes(r.status))&&r.ct.includes('json'),JSON.stringify(r));
}
const objectRoot=process.env.SQUIDLAW_OBJECT_ROOT||'/var/lib/squidlaw/objects';
try{const st=await stat(objectRoot);check('object-root-readable',st.isDirectory())}
catch(e){check('object-root-readable',false,e.code||'ERROR')}
if(process.env.SQUID_CUSTOMER_DATABASE_URL){
 try{
  const {withLeaseDb}=await import('../api/customer-analysis-lease-db.js');
  const result=await withLeaseDb(async db=>db.query("SELECT count(*)::integer AS total, count(*) FILTER (WHERE status='failed' AND error_code='CASE_NOT_FOUND')::integer AS missing_registry FROM customer_analysis_jobs"));
  check('database-query',true,'jobs='+result.rows[0].total+' missing_registry='+result.rows[0].missing_registry);
 }catch(e){check('database-query',false,String(e.code||e.name||'ERROR'))}
}else check('database-configured',false,'missing');
console.log(JSON.stringify({kind:'gabia-integration-audit-v1',checks},null,2));
if(checks.some(x=>!x.ok))process.exitCode=1;
