import {checkpointTask} from './skynet-worker-core.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
export function verifyCommittedCode(job,taskId){
 const p=job.codeProposal;
 if(!p||p.taskId!==taskId||p.status!=='committed'||!/^[a-f0-9]{40}$/.test(p.commitSha||''))throw Error('COMMIT_EVIDENCE_REQUIRED');
 const task=job.tasks?.find(t=>t.id===taskId);
 if(task?.status!=='implemented')throw Error('TASK_NOT_IMPLEMENTED');
 if(job.operations?.[p.key]?.status!=='completed'||job.operations[p.key].result?.ok!==true||job.operations[p.key].result?.sha!==p.commitSha)throw Error('COMMIT_RECEIPT_MISMATCH');
 if(!task.evidence?.includes('commit:'+p.commitSha))throw Error('COMMIT_EVIDENCE_MISMATCH');
 return appendJobEvent(checkpointTask(job,taskId,{status:'verified',evidence:task.evidence}),'code-task-verified',{taskId,commitSha:p.commitSha});
}
