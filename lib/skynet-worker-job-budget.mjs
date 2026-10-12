import {taskToolBudget} from './skynet-worker-task-budget.mjs';
export function jobToolBudget(tasks){let calls=0,bytes=0;for(const task of tasks){const n=taskToolBudget(task);calls+=n.calls;bytes+=n.bytes}if(calls>500||bytes>300000)throw Error('JOB_TOOL_BUDGET_EXCEEDED');return {calls,bytes}}
