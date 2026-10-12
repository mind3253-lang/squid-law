import {leaseExpired,leaseJob} from './skynet-job-lease.mjs';
export function claimJob(job,owner){if(!owner||!/^[A-Za-z0-9_-]{1,80}$/.test(owner))throw Error('INVALID_OWNER');if(job.status==='running'&&!leaseExpired(job))throw Error('JOB_ALREADY_LEASED');if(!['queued','running'].includes(job.status))throw Error('JOB_NOT_RUNNABLE');return leaseJob({...job,status:'running'},owner)}
