import {unfinishedTasks} from './skynet-job-state.mjs';
export function scheduleNext(tasks){const eligible=unfinishedTasks(tasks);return {next:eligible[0]||null,eligibleCount:eligible.length,blocked:tasks.filter(t=>t.status==='blocked').map(t=>t.id)}}
