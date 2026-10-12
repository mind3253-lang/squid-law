export function leaseExpired(job,now=Date.now()){if(job.status!=='running')return false;const until=Date.parse(job.leaseUntil||'');return !Number.isFinite(until)||until<=now}
export function leaseJob(job,owner,ttlMs=120000){if(!owner||ttlMs<1000||ttlMs>3600000)throw Error('INVALID_LEASE');return {...job,owner,leaseUntil:new Date(Date.now()+ttlMs).toISOString()}}
