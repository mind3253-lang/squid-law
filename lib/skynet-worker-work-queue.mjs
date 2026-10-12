import {unfinishedTasks} from './skynet-job-state.mjs';
export function workerQueue(job){return unfinishedTasks(job.tasks||[]).map(t=>({taskId:t.id,status:t.status,priority:t.priority,toolCount:t.toolCalls?.length||0}))}
