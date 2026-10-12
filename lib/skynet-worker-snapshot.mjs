import {resumePoint} from './skynet-worker-resume.mjs';
import {latestEvents} from './skynet-job-history.mjs';
export function workerSnapshot(job){return {...resumePoint(job),status:job.status,events:latestEvents(job,10),operations:Object.keys(job.operations||{}).length}}
