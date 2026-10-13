import {waitUntil} from '@vercel/functions';

// Progression is an authenticated, best-effort nudge, never a substitute for
// PostgreSQL queue ownership and fenced job leases. The 5-minute cron remains
// the recovery fallback when background dispatch is unavailable.
export function scheduleCustomerWorker({delayMs=2500}={}){
 const secret=process.env.CRON_SECRET,host=process.env.VERCEL_URL;
 if(!secret||!host||!/^[a-z0-9.-]+$/i.test(host))return false;
 const delay=Math.max(0,Math.min(10000,Number(delayMs)||0));
 const work=(async()=>{
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  try{
   const r=await fetch('https://'+host+'/api/customer-analysis-worker',{
    method:'POST',headers:{authorization:'Bearer '+secret},
    signal:AbortSignal.timeout(25000),redirect:'error'
   });
   if(!r.ok)console.warn('CUSTOMER_WORKER_DISPATCH',r.status);
  }catch(e){console.warn('CUSTOMER_WORKER_DISPATCH_DEFERRED',String(e?.name||'REQUEST_FAILED'))}
 })();
 try{waitUntil(work);return true}catch{
  // Without a request context the cron/UI poll resumes instead.
  return false;
 }
}
