// Single, explicitly selected worker owner. Defaults to Vercel until cutover.
export function customerWorkerOwner(env=process.env){
 return env.SQUIDLAW_CUSTOMER_WORKER_OWNER==='gabia'?'gabia':'vercel';
}
export function mayClaimCustomerJob(env=process.env){
 const owner=customerWorkerOwner(env);
 if(owner==='vercel')return env.SQUIDLAW_CONTINUOUS_WORKER!=='1';
 return env.SQUIDLAW_CONTINUOUS_WORKER==='1' &&
  env.SQUIDLAW_WORKER_RUN_APPROVED==='YES' &&
  env.SQUIDLAW_WORKER_CUTOVER_APPROVED==='YES';
}
export function shouldDispatchCustomerWorker(env=process.env){
 return customerWorkerOwner(env)==='vercel'&&env.SQUIDLAW_CONTINUOUS_WORKER!=='1';
}
