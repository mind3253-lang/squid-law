import {appendCodingTask} from './skynet-code-task.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
const failures=new Set(['ERROR','CANCELED']);
export function createDeploymentRepairTask(job,{deploymentId,state,reason}){
 if(job.previewDeployment?.deploymentId!==deploymentId)throw Error('DEPLOYMENT_MISMATCH');
 if(!failures.has(state))throw Error('DEPLOYMENT_NOT_FAILED');
 if(!job.scopes?.includes('repository:write'))throw Error('WRITE_SCOPE_REQUIRED');
 const existing=(job.tasks||[]).filter(t=>t.kind==='repair'&&t.deploymentId===deploymentId);
 if(existing.length)return job;
 const id='repair-'+deploymentId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,55);
 const taskTitle='Investigate failed preview deployment '+deploymentId.slice(0,30);
 const added=appendCodingTask(job,{id,title:taskTitle,dependsOn:[]});
 const tasks=added.tasks.map(t=>t.id===id?{...t,kind:'repair',deploymentId,repairContext:String(reason||state).slice(0,2000)}:t);
 return appendJobEvent({...added,tasks},'deployment-repair-task-created',{taskId:id,deploymentId,state});
}
