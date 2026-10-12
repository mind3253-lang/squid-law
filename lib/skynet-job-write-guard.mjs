export function expectedJobRevision(job){if(!Number.isSafeInteger(job?.revision)||job.revision<1)throw Error('REVISION_REQUIRED');return job.revision}
export function assertWorkerRevision(job,owner){if(job.status!=='running'||job.owner!==owner||!(Date.parse(job.leaseUntil)>Date.now()))throw Error('WORKER_LEASE_REQUIRED');return expectedJobRevision(job)}
