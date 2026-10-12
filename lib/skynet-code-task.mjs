import {validatePlan} from './skynet-job-plan.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
export function appendCodingTask(job,{id,title,dependsOn=[]}){
 if(!['queued','running'].includes(job.status))throw Error('JOB_NOT_EDITABLE');
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id||'')||typeof title!=='string'||!title.trim()||title.length>180)throw Error('INVALID_CODING_TASK');
 if(!Array.isArray(dependsOn)||dependsOn.some(x=>typeof x!=='string'))throw Error('INVALID_DEPENDENCIES');
 if((job.tasks||[]).length>=200)throw Error('TASK_LIMIT');
 const tasks=validatePlan([...(job.tasks||[]),{id,title,kind:'coding',priority:'P0',dependsOn,toolCalls:[],status:'todo'}]);
 return appendJobEvent({...job,tasks},'coding-task-added',{taskId:id,dependsOn});
}
export function enableCodingScope(job,{repository,branch}){
 if(!['queued','running'].includes(job.status))throw Error('JOB_NOT_EDITABLE');
 if(job.writeTargets?.repository!==repository||job.writeTargets?.branch!==branch)throw Error('WRITE_TARGET_NOT_APPROVED');
 if(!job.scopes?.includes('repository:read'))throw Error('READ_SCOPE_REQUIRED');
 const scopes=[...new Set([...job.scopes,'repository:write'])];
 return appendJobEvent({...job,scopes},'coding-scope-enabled',{repository,branch});
}
