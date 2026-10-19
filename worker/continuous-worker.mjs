// Persistent customer analysis worker. Run as a separate Node.js process.
// This intentionally reuses the existing fenced PostgreSQL claim/checkpoint
// handler, so no customer data is migrated and no analysis step is skipped.
// Explicit opt-in: merely installing the unit must never claim a customer job.
if(process.env.SQUIDLAW_WORKER_RUN_APPROVED!=='YES'){
 console.error('WORKER_NOT_APPROVED: SQUIDLAW_WORKER_RUN_APPROVED=YES required');
 process.exit(78);
}
// Production takeover requires a separate, explicit acknowledgement.
if(process.env.SQUIDLAW_WORKER_CUTOVER_APPROVED!=='YES'){
 console.error('WORKER_CUTOVER_NOT_APPROVED');
 process.exit(78);
}
const required=['CRON_SECRET','BLOB_READ_WRITE_TOKEN'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(!(process.env.SQUID_CUSTOMER_DATABASE_URL||process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL)?.trim())missing.push('SQUID_CUSTOMER_DATABASE_URL');
if(missing.length){
 console.error('WORKER_CONFIGURATION_MISSING:',missing.join(','));
 process.exit(78);
}
if(process.env.SQUIDLAW_LEGAL_API_ENABLED==='true'&&!process.env.OPENAI_API_KEY?.trim()){
 console.error('WORKER_OPENAI_KEY_MISSING');process.exit(78);
}
process.env.SQUIDLAW_CONTINUOUS_WORKER='1';
const {default:handler}=await import('../api/customer-analysis-worker.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const idleMs=Math.max(250,Number(process.env.SQUIDLAW_WORKER_IDLE_MS)||1500);
let stopping=false;
process.on('SIGTERM',()=>{stopping=true});
process.on('SIGINT',()=>{stopping=true});
const req={method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}};
if(!process.env.CRON_SECRET){
 console.error('WORKER_REQUIRED_CONFIGURATION_MISSING');process.exit(1);
}
while(!stopping){
 let status=500,body=null;
 const res={setHeader(){return this},status(code){status=code;return this},json(data){body=data;return this}};
 try{
  await handler(req,res);
  if(status!==200&&status!==503)console.error('WORKER_HTTP_STATUS',status);
  if(status===503)console.error('WORKER_STEP_FAILED',body?.error||'UNKNOWN');
 }catch(error){
  console.error('WORKER_LOOP_FAILURE',String(error?.message||error).slice(0,160));
 }
 // DB next_run_at gates retries; keep polling without invoking another server.
 // An idle response means there is no claimable job, not necessarily no jobs.
 await sleep(body?.status==='idle'?idleMs:Math.min(idleMs,500));
}
