import {waitUntil} from '@vercel/functions';
import {shouldDispatchCustomerWorker} from './customer-worker-owner.mjs';

// A completed checkpoint should immediately trigger the next leased worker.
// The cron is a last-resort recovery path, not the normal processing cadence.
export function scheduleCustomerWorker({delayMs=350}={}){
 // Gabia worker polls the durable database queue itself; never send Vercel HTTP requests.
 if(!shouldDispatchCustomerWorker())return false;
 const secret=process.env.CRON_SECRET;
 const host=process.env.VERCEL_URL||process.env.VERCEL_PROJECT_PRODUCTION_URL;
 if(!secret||!host||!/^[a-z0-9.-]+$/i.test(host)){
  console.error('CUSTOMER_WORKER_DISPATCH_CONFIG_MISSING');
  return false;
 }
 const delay=Math.max(0,Math.min(3000,Number(delayMs)||0));
 const work=(async()=>{
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  for(let attempt=0;attempt<3;attempt++){
   try{
    const r=await fetch('https://'+host+'/api/customer-analysis-worker',{
     method:'POST',headers:{authorization:'Bearer '+secret},
     signal:AbortSignal.timeout(25000),redirect:'error'
    });
    if(r.ok)return;
    console.warn('CUSTOMER_WORKER_DISPATCH_HTTP',r.status,'attempt',attempt+1);
    if(r.status===401||r.status===403)return;
   }catch(e){
    console.warn('CUSTOMER_WORKER_DISPATCH_RETRY',String(e?.name||'REQUEST_FAILED'),'attempt',attempt+1);
   }
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
  console.error('CUSTOMER_WORKER_DISPATCH_EXHAUSTED');
 })();
 try{waitUntil(work);return true}catch(e){
  console.error('CUSTOMER_WORKER_DISPATCH_WAITUNTIL_FAILED',String(e?.message||e));
  return false;
 }
}
