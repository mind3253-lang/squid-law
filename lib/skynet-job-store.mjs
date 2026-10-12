import {get,put,list} from '@vercel/blob';
const prefix='skynet/jobs/';
export function jobPath(id){if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))throw Error('INVALID_JOB_ID');return prefix+id+'.json'}
export async function loadJob(id){const r=await get(jobPath(id),{access:'private'});if(!r||r.statusCode!==200)return null;const chunks=[];let size=0;for await(const p of r.stream){size+=p.length;if(size>1000000)throw Error('JOB_TOO_LARGE');chunks.push(Buffer.from(p))}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
export async function saveJob(job,{overwrite=true}={}){const data=JSON.stringify(job);if(Buffer.byteLength(data)>1000000)throw Error('JOB_TOO_LARGE');await put(jobPath(job.id),data,{access:'private',addRandomSuffix:false,allowOverwrite:overwrite,contentType:'application/json'});return job}
export async function listJobs(limit=100,cursor){const r=await list({prefix,limit:Math.min(1000,Math.max(1,limit)),...(cursor?{cursor}:{})});return {jobs:r.blobs.filter(b=>b.pathname.endsWith('.json')).map(b=>({id:b.pathname.slice(prefix.length,-5),updatedAt:b.uploadedAt})),hasMore:r.hasMore,cursor:r.cursor||null}}
