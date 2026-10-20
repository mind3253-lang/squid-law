// Pure queue transition policy, independent of Vercel.
export function gabiaQueueDecision({status,attempts,maxAttempts,leaseExpired=false}){
 if(!Number.isSafeInteger(attempts)||attempts<0||!Number.isSafeInteger(maxAttempts)||maxAttempts<1)throw Error('INVALID_QUEUE_ATTEMPTS');
 if(status==='queued')return 'claim';
 if(status==='running'&&leaseExpired)return attempts>=maxAttempts?'failed':'recover';
 if(status==='retry')return attempts>=maxAttempts?'failed':'claim';
 return 'hold';
}
export function gabiaQueueOrder(jobs){
 if(!Array.isArray(jobs))throw Error('INVALID_QUEUE');
 return [...jobs].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.jobId).localeCompare(String(b.jobId)));
}
