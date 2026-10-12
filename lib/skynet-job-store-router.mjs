import {loadJob,saveJob,listJobs} from './skynet-job-store.mjs';
import {loadPgJob,createPgJob,updatePgJob,listPgJobs} from './skynet-job-pg-store.mjs';
export const atomicJobsEnabled=()=>process.env.SKYNET_JOB_BACKEND==='postgres'&&Boolean(process.env.POSTGRES_URL);
export async function readJob(id){return atomicJobsEnabled()?loadPgJob(id):loadJob(id)}
export async function writeJob(job,{overwrite=true,expectedRevision}={}){if(!atomicJobsEnabled())return saveJob(job,{overwrite});return overwrite?updatePgJob(job,expectedRevision):createPgJob(job)}
export async function readJobs(limit=100,cursor){return atomicJobsEnabled()?listPgJobs(limit,Number.isSafeInteger(Number(cursor))&&Number(cursor)>=0?Number(cursor):0):listJobs(limit,cursor)}
export function requireAtomicJobs(){if(!atomicJobsEnabled())throw Error('ATOMIC_JOB_STORAGE_REQUIRED')}
