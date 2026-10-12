import {taskToolRequest} from './skynet-worker-task-dispatch.mjs';
import {taskStepNumber} from './skynet-task-step-key.mjs';
import {operationKey} from './skynet-job-state.mjs';
import {checkpointTask} from './skynet-worker-core.mjs';
export function verifyInspection(job,taskId){
 const task=job.tasks?.find(t=>t.id===taskId);
 if(task?.kind!=='inspection'||task.status!=='implemented')throw Error('INSPECTION_NOT_IMPLEMENTED');
 if(!task.toolCalls?.length||taskToolRequest(job,task)?.status!=='all_tools_completed')throw Error('INSPECTION_INCOMPLETE');
 const expected=task.toolCalls.map((call,i)=>{if(!['github.read','vercel.inspect'].includes(call.name))throw Error('UNSAFE_INSPECTION');const key=operationKey(job.id,taskStepNumber(task.id,i),call.name,call.args);const op=job.operations?.[key];if(op?.status!=='completed'||op.taskId!==task.id||op.result?.ok!==true)throw Error('INSPECTION_EVIDENCE_MISSING');return 'tool:'+key});
 if(JSON.stringify(expected)!==JSON.stringify(task.evidence))throw Error('INSPECTION_EVIDENCE_MISMATCH');
 return checkpointTask(job,taskId,{status:'verified',evidence:expected});
}
