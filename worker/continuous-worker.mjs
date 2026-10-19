// Persistent customer analysis worker. Run as a separate Node.js process.
// This intentionally reuses the existing fenced PostgreSQL claim/checkpoint
// handler, so no customer data is migrated and no analysis step is skipped.
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
