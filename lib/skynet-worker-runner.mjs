import {readJob,writeJob,requireAtomicJobs} from './skynet-job-store-router.mjs';
import {claimJob} from './skynet-worker-claim.mjs';
import {selectWork,checkpointTask} from './skynet-worker-core.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
import {workerProgress} from './skynet-worker-progress.mjs';
import {taskBlockers} from './skynet-worker-blockers.mjs';
import {completeVerifiedJob} from './skynet-worker-completion.mjs';
import {taskToolRequest} from './skynet-worker-task-dispatch.mjs';
import {dispatchAction} from './skynet-worker-dispatch-policy.mjs';
import {assertWorkerLease} from './skynet-worker-lease-check.mjs';
import {operationSummary} from './skynet-worker-operation-summary.mjs';
import {pendingWriteApprovals} from './skynet-worker-approval-pending.mjs';
import {planStats} from './skynet-worker-plan-stats.mjs';
import {workerQueue} from './skynet-worker-work-queue.mjs';
export async function runWorkerTick({jobId,owner}){if(!/^[\w-]{1,80}$/.test(owner||''))throw Error('INVALID_OWNER');requireAtomicJobs();const job=await readJob(jobId);if(!job)throw Error('JOB_NOT_FOUND');let active=job;if(job.status==='queued'){active=appendJobEvent(claimJob(job,owner),'worker-claimed',{owner});active=await writeJob(active,{expectedRevision:job.revision})}assertWorkerLease(active,owner);const next=selectWork(active);if(next.done&&active.tasks?.length){if((active.tasks||[]).some(t=>taskToolRequest(active,t)?.status!=='all_tools_completed'&&t.toolCalls?.length))throw Error('UNFINISHED_TASK_TOOLS');const completed=completeVerifiedJob(active,owner);await writeJob(completed,{expectedRevision:active.revision});return {status:'completed',jobId}};if(!next.task)return {status:'waiting',jobId,blocked:next.blocked,dependencies:taskBlockers(active.tasks||[]),operations:operationSummary(active),pendingWrites:pendingWriteApprovals(active),plan:planStats(active.tasks||[]),queue:workerQueue(active),progress:workerProgress(active)};if(next.task.status==='blocked')throw Error('TASK_BLOCKED');if(next.task.status==='todo'){const changed=checkpointTask(active,next.task.id,{status:'in_progress'});await writeJob(changed,{expectedRevision:active.revision});return {status:'task_started',jobId,owner,taskId:next.task.id,dispatch:dispatchAction(changed,taskToolRequest(changed,next.task)),progress:workerProgress(changed)}}if(!['in_progress','implemented'].includes(next.task.status))throw Error('TASK_NOT_RUNNABLE');return {status:'task_in_progress',jobId,owner,taskId:next.task.id,dispatch:dispatchAction(active,taskToolRequest(active,next.task)),progress:workerProgress(active)}}
