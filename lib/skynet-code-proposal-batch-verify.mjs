import {checkpointTask} from './skynet-worker-core.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
export function verifyProposalBatch(job,taskId){
 const batch=job.codeProposalBatch;
 if(!batch||batch.taskId!==taskId||!batch.items?.length||batch.items.some(p=>p.status!=='committed'))throw Error('BATCH_NOT_COMMITTED');
 const task=job.tasks?.find(t=>t.id===taskId);if(task?.status!=='implemented')throw Error('TASK_NOT_IMPLEMENTED');
 const expected=batch.items.map(p=>{const op=job.operations?.[p.key];if(op?.status!=='completed'||op.result?.sha!==p.commitSha||!op.result?.ok)throw Error('COMMIT_RECEIPT_MISMATCH');return 'commit:'+p.commitSha});
 if(JSON.stringify(task.evidence)!==JSON.stringify(expected))throw Error('TASK_EVIDENCE_MISMATCH');
 return appendJobEvent(checkpointTask(job,taskId,{status:'verified',evidence:expected}),'code-batch-verified',{taskId,count:expected.length});
}
