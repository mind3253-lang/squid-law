export function progressView(job){return {id:job.id,status:job.status,stage:job.stage||null,updatedAt:job.updatedAt||null,finished:job.status==='completed'}}
