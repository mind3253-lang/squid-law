// Single active job owner: the approved Gabia continuous worker.
export function customerWorkerOwner(){return 'gabia'}
export function mayClaimCustomerJob(env=process.env){
 return env.SQUIDLAW_CONTINUOUS_WORKER==='1' &&
  env.SQUIDLAW_WORKER_RUN_APPROVED==='YES' &&
  env.SQUIDLAW_WORKER_CUTOVER_APPROVED==='YES';
}
export function shouldDispatchCustomerWorker(){return false}
