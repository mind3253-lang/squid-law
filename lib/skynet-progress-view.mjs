import {terminalStatus} from './skynet-job-state.mjs';
export function progressView(job){return {id:job.id,status:job.status,stage:job.stage||null,updatedAt:job.updatedAt||null,finished:terminalStatus(job.status),successful:job.status==='completed'}}
