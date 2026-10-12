import {appendJobEvent} from './skynet-job-events.mjs';
import {checkpointTask} from './skynet-worker-core.mjs';
import {codeProposalReceipt} from './skynet-code-proposal-state.mjs';
export function reconcileCommittedProposal(job){
 const p=job.codeProposal;
 if(!p)throw Error('NO_CODE_PROPOSAL');
 if(p.status==='committed')return job;
 const op=job.operations?.[p.key];
 if(op?.status!=='completed')throw Error('WRITE_NOT_COMPLETED');
 const commitSha=op.result?.sha||op.result?.commitSha;
 const committed=codeProposalReceipt(job,p.key,{sha:commitSha});
 const task=committed.tasks?.find(t=>t.id===p.taskId);
 if(!task||task.status!=='in_progress')throw Error('TASK_NOT_IN_PROGRESS');
 const updated=checkpointTask(committed,p.taskId,{status:'implemented',evidence:['commit:'+commitSha]});
 return appendJobEvent(updated,'code-commit-reconciled',{taskId:p.taskId,commitSha});
}
