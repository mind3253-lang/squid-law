// Loopback-only operational diagnostics; no customer data, secrets or analysis execution.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
function serviceState(name){
 try{return execFileSync('systemctl',['is-active',name],{encoding:'utf8',timeout:1500,stdio:['ignore','pipe','ignore']}).trim();}
 catch(e){const v=String(e.stdout||'').trim();return ['inactive','failed','activating','deactivating'].includes(v)?v:'unavailable';}
}
async function deployment(){
 let lastUpdate=null;
 try{
  const parsed=JSON.parse(await readFile('/var/lib/squidlaw/auto-update-status.json','utf8'));
  const outcomes=['applied','already_current','skipped_worker_active','skipped_local_changes','skipped_non_fast_forward','fetch_failed','update_failed'];
  if(outcomes.includes(parsed.outcome)&&/^[a-f0-9]{40}$/.test(parsed.revision)&&!Number.isNaN(Date.parse(parsed.recordedAt)))
   lastUpdate={outcome:parsed.outcome,revision:parsed.revision,recordedAt:parsed.recordedAt};
 }catch{}
 return {autoUpdateTimer:serviceState('squidlaw-auto-update.timer'),
  analysisWorker:serviceState('squidlaw-worker.service'),lastUpdate};
}
const host=process.env.SQUIDLAW_HEALTH_HOST||'127.0.0.1';
if(host!=='127.0.0.1'&&host!=='::1')throw Error('HEALTH_DIAGNOSTICS_LOOPBACK_ONLY');
const port=Number(process.env.SQUIDLAW_HEALTH_PORT||3081);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_HEALTH_PORT');
const started=Date.now();
const bytesToMiB=n=>Math.round(n/1048576);
async function diagnostics(){
 const memory=process.memoryUsage();
 let loadAverage=null;
 try{
  const text=await readFile('/proc/loadavg','utf8');
  const values=text.trim().split(/\s+/).slice(0,3).map(Number);
  if(values.every(Number.isFinite))loadAverage=values;
 }catch{}
 return {status:'ok',service:'squidlaw-health',analysisExecuted:false,
  uptimeSeconds:Math.floor((Date.now()-started)/1000),
  process:{pid:process.pid,memoryMiB:{rss:bytesToMiB(memory.rss),heapUsed:bytesToMiB(memory.heapUsed)}},
  deployment:await deployment(),
  system:{loadAverage,freeMemoryMiB:bytesToMiB((await import('node:os')).freemem()),
   totalMemoryMiB:bytesToMiB((await import('node:os')).totalmem())},
  note:'Health process only; worker, database, blob and AI availability not verified'};
}
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'||!['/healthz','/diagnostics'].includes(req.url)){
  res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});
  res.end('{"error":"NOT_FOUND"}');return;
 }
 try{
  const body=req.url==='/healthz'?
   {status:'ok',service:'squidlaw-health',analysisExecuted:false}:
   await diagnostics();
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(body));
 }catch{
  res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
  res.end('{"error":"DIAGNOSTICS_UNAVAILABLE"}');
 }
});
server.requestTimeout=10000;
server.headersTimeout=5000;
server.listen(port,host,()=>console.log('HEALTH_SERVER_LISTENING',host,port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
