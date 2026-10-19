// A single analysis lane is the current owner-approved product policy.
export function gabiaQueueOrder(rows){
 if(!Array.isArray(rows))throw Error('INVALID_QUEUE_ROWS');
 return [...rows].filter(x=>['queued','retry','running'].includes(x?.status)).sort((a,b)=>{
  const left=Date.parse(a.created_at),right=Date.parse(b.created_at);
  if(!Number.isFinite(left)||!Number.isFinite(right))throw Error('INVALID_QUEUE_TIMESTAMP');
  return left-right||String(a.job_id).localeCompare(String(b.job_id));
 });
}
export function gabiaQueuePosition(rows,jobId){
 const ordered=gabiaQueueOrder(rows);
 const index=ordered.findIndex(x=>x.job_id===jobId);
 return index<0?null:index+1;
}
