import {workerFailureDelayMs} from '../lib/gabia-worker-backoff.mjs';
import {workerPreflight} from '../lib/gabia-worker-preflight.mjs';
import {captureServerError} from '../lib/server-error-diagnostics.mjs';
import {customerWorkerParallelism,workerMayBeginCycle} from '../lib/customer-worker-capacity.mjs';
import {availableParallelism,totalmem,freemem} from 'node:os';
import {readFileSync} from 'node:fs';
const preflight=workerPreflight();
if(!preflight.ok){
 for(const error of preflight.errors)console.error(error);
 process.exit(78);
}
process.env.SQUIDLAW_CONTINUOUS_WORKER='1';
// Fixed-vocabulary timing logs contain no user IDs, filenames or document text.
// Explicit SQUIDLAW_ANALYSIS_TIMING=0 remains an opt-out.
if(process.env.SQUIDLAW_ANALYSIS_TIMING===undefined)process.env.SQUIDLAW_ANALYSIS_TIMING='1';
const {default:handler}=await import('../api/customer-analysis-worker.js');
const {performance}=await import('node:perf_hooks');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const idleMs=Math.max(250,Number(process.env.SQUIDLAW_WORKER_IDLE_MS)||1500);
let stopping=false;
let activeCycles=0;
const parallelLanes=customerWorkerParallelism({cpuCount:availableParallelism(),totalMemoryBytes:totalmem()});
// Linux MemAvailable includes reclaimable file cache; free memory alone would
// incorrectly stall a healthy worker with cached PDF source data.
function availableMemoryBytes(){
 try{
  const memory=/^MemAvailable:\s*(\d+)\s*kB/m.exec(readFileSync('/proc/meminfo','utf8'));
  if(memory)return Number(memory[1])*1024;
 }catch{}
 return freemem();
}

process.on('SIGTERM',()=>{stopping=true});
process.on('SIGINT',()=>{stopping=true});
const req={method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}};
if(!process.env.CRON_SECRET){
 console.error('WORKER_REQUIRED_CONFIGURATION_MISSING');process.exit(1);
}
console.log('WORKER_RESOURCE_PARALLELISM '+JSON.stringify({lanes:parallelLanes}));
async function runLane(){
 let consecutiveFailures=0;
 while(!stopping){
  if(!workerMayBeginCycle({availableMemoryBytes:availableMemoryBytes(),activeCycles})){
   await sleep(idleMs);continue;
  }
  activeCycles++;
  const started=performance.now();
  let status=500,body=null;
  const res={setHeader(){return this},status(code){status=code;return this},json(data){body=data;return this}};
  try{
   await handler(req,res);
   if(status!==200&&status!==503)console.error('WORKER_HTTP_STATUS',status);
   if(status===503)console.error('WORKER_STEP_FAILED',body?.error||'UNKNOWN');
  }catch(error){
   const {traceId}=captureServerError(error,{system:'SQUIDLAW',operation:'continuous-worker',stage:'loop'});
   console.error('WORKER_LOOP_FAILURE',traceId);
  }finally{activeCycles--}
  consecutiveFailures=status===200?0:Math.min(32,consecutiveFailures+1);
  // Measure each independent checkpoint roundtrip, never wall-clock queue time.
  // Fixed fields only: never log customer IDs, filenames or error messages.
  if(process.env.SQUIDLAW_ANALYSIS_TIMING==='1'){
   const elapsedMs=Math.max(0,Math.round(performance.now()-started));
   const outcome=status===200?'ok':'error';
   const kind=body?.status==='idle'?'idle':body?.status==='inactive_owner'?'inactive':body?.status==='retry'?'checkpoint':'other';
   console.log('ANALYSIS_WORKER_CYCLE '+JSON.stringify({outcome,kind,elapsedMs}));
  }
  // DB next_run_at gates retries; an idle lane never blocks a different job.
  if(!stopping)await sleep(consecutiveFailures?workerFailureDelayMs(consecutiveFailures):(body?.status==='idle'?idleMs:Math.min(idleMs,500)));
 }
}
// Independent lanes share one process and one DB pool. Each handler claims a
// distinct fenced job row; SIGTERM waits for every running checkpoint to end.
await Promise.all(Array.from({length:parallelLanes},()=>runLane()));
