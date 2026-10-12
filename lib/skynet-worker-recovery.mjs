import {leaseExpired} from './skynet-job-lease.mjs';
export function recoverable(job,now=Date.now()){return job.status==='queued'||leaseExpired(job,now)}
export function recoverJob(job){if(!recoverable(job))throw Error('JOB_NOT_RECOVERABLE');return {...job,status:'queued',owner:null,leaseUntil:null,recoveryCount:(job.recoveryCount||0)+1,updatedAt:new Date().toISOString()}}
