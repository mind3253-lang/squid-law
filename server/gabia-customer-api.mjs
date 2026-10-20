// Local-only preview API. Must never activate without separate DB and auth secrets.
// The analysis worker is intentionally NOT started by this server.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {Pool} from 'pg';
import {verifyCustomerToken} from './customer-auth.mjs';
import {createGabiaJobStore} from './gabia-customer-jobs.mjs';
const host=process.env.SQUIDLAW_GABIA_API_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_GABIA_API_PORT||3083);
if(host!=='127.0.0.1'&&host!=='::1')throw Error('GABIA_API_LOOPBACK_ONLY');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_GABIA_API_PORT');
if(process.env.SQUIDLAW_GABIA_API_PREVIEW!=='1')throw Error('GABIA_API_PREVIEW_DISABLED');
if(!process.env.SQUIDLAW_GABIA_DATABASE_URL||!process.env.SQUIDLAW_GABIA_AUTH_SECRET||Buffer.byteLength(process.env.SQUIDLAW_GABIA_AUTH_SECRET)<32)throw Error('GABIA_API_CONFIG_MISSING');
const pool=new Pool({connectionString:process.env.SQUIDLAW_GABIA_DATABASE_URL,max:4,connectionTimeoutMillis:3000,ssl:process.env.SQUIDLAW_GABIA_DB_LOCAL==='1'?false:{rejectUnauthorized:true}});
const store=createGabiaJobStore(pool);
const reportRoot=process.env.SQUIDLAW_GABIA_REPORT_ROOT||'';
async function readPrivateDraft({subject,caseId,jobId}){
 if(!reportRoot.startsWith('/'))throw Error('GABIA_REPORT_ROOT_MISSING');
 const customerKey=(await import('node:crypto')).createHash('sha256').update(subject).digest('hex');
 const r=await pool.query('SELECT status,stage,checkpoint FROM gabia_customer_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3',[customerKey,caseId,jobId]);
 if(r.rowCount!==1)return null;
 const job=r.rows[0];
 if(job.stage!=='preliminary_report_written')return {status:job.status,stage:job.stage,ready:false};
 const root=resolve(reportRoot);const base=resolve(root,customerKey,caseId,jobId);
 if(!base.startsWith(root+sep))throw Error('INVALID_REPORT_PATH');
 const requested=job.checkpoint?.legalDraft?base+'.legal.md':base+'.preliminary.md';
 const recorded=job.checkpoint?.legalDraft||job.checkpoint?.preliminaryReport;
 if(resolve(recorded||'')!==requested)throw Error('REPORT_CHECKPOINT_MISMATCH');
 const content=await readFile(requested,'utf8');
 return {status:job.status,stage:job.stage,ready:true,kind:job.checkpoint?.legalDraft?'legal_draft':'preliminary',verified:false,content};
}
function respond(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
const server=createServer(async(req,res)=>{
 try{
  const identity=verifyCustomerToken(String(req.headers.authorization||'').replace(/^Bearer /,''),{secret:process.env.SQUIDLAW_GABIA_AUTH_SECRET});
  if(!identity){respond(res,401,{error:'UNAUTHORIZED'});return;}
  const url=new URL(req.url,'http://localhost');
  const match=url.pathname.match(/^\/v1\/cases\/([a-f0-9-]{36})\/jobs(?:\/([a-f0-9-]{36})(?:\/(result))?)?$/);
  if(!match){respond(res,404,{error:'NOT_FOUND'});return;}
  const [,caseId,jobId,kind]=match;
  if(req.method==='POST'&&!jobId){
   let raw='';for await(const chunk of req){raw+=chunk.toString();if(raw.length>2048){respond(res,413,{error:'BODY_TOO_LARGE'});return;}}
   let body;try{body=JSON.parse(raw);}catch{respond(res,400,{error:'INVALID_JSON'});return;}
   const job=await store.enqueue({subject:identity.subject,caseId,documentVersion:body.documentVersion});
   respond(res,202,{job,status:'queued',worker:'NOT_CONNECTED'});return;
  }
  if(req.method==='GET'&&jobId){
   const job=kind==='result'?await readPrivateDraft({subject:identity.subject,caseId,jobId}):await store.status({subject:identity.subject,caseId,jobId});
   if(!job){respond(res,404,{error:'NOT_FOUND'});return;}
   if(kind==='result'){respond(res,job.ready?200:202,job);return;}
   respond(res,200,{job});return;
  }
  respond(res,405,{error:'METHOD_NOT_ALLOWED'});
 }catch(e){respond(res,e.message==='INVALID_JOB_REQUEST'?400:503,{error:e.message==='INVALID_JOB_REQUEST'?'INVALID_JOB_REQUEST':'SERVICE_UNAVAILABLE'});}
});
server.listen(port,host,()=>console.log('GABIA_API_PREVIEW_LOOPBACK_ONLY',port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>pool.end().finally(()=>process.exit(0))));
