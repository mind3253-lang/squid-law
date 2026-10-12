import {checkpointTask} from './skynet-worker-core.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
export function finalizeProposalBatch(job){const batch=job.codeProposalBatch;if(!batch?.items?.length||batch.items.some(p=>p.status!=='committed'))throw Error('BATCH_NOT_COMMITTED');
 const task=job.tasks?.find(t=>t.id===batch.taskId);if(!task||task.status!=='in_progress')throw Error('TASK_NOT_IN_PROGRESS');
 const evidence=batch.items.map(p=>{const op=job.operations?.[p.key];if(op?.status!=='completed'||op.result?.ok!==true||op.result?.sha!==p.commitSha)throw Error('COMMIT_RECEIPT_MISMATCH');return 'commit:'+p.commitSha});
 return appendJobEvent(checkpointTask(job,batch.taskId,{status:'implemented',evidence}),'code-batch-implemented',{taskId:batch.taskId,files:batch.items.length});
}
