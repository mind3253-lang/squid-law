import {summarize} from './skynet-run-summary.mjs';
export function jobReport(job){const tasks=Array.isArray(job.tasks)?job.tasks:[];return {id:job.id,status:job.status,summary:summarize(tasks),checkpoint:job.checkpoint||null,updatedAt:job.updatedAt||null}}
