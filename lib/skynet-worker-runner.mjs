import {readJob,writeJob,requireAtomicJobs} from './skynet-job-store-router.mjs';
import {claimJob} from './skynet-worker-claim.mjs';
import {selectWork,checkpointTask} from './skynet-worker-core.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
import {workerProgress} from './skynet-worker-progress.mjs';
import {taskBlockers} from './skynet-worker-blockers.mjs';
import {completeVerifiedJob} from './skynet-worker-completion.mjs';
export async function runWorkerTick({jobId,owner}){requireAtomicJobs();const job=await readJob(jobId);if(!job)throw Error('JOB_NOT_FOUND');let active=job;if(job.status==='queued'){active=appendJobEvent(claimJob(job,owner),'worker-claimed',{owner});active=await writeJob(active,{expectedRevision:job.revision})}if(active.status!=='running'||active.owner!==owner||!(Date.parse(active.leaseUntil)>Date.now()))throw Error('WORKER_LEASE_REQUIRED');const next=selectWork(active);if(next.done){const completed=completeVerifiedJob(active,owner);await writeJob(completed,{expectedRevision:active.revision});return {status:'completed',jobId}};if(!next.task)return {status:'waiting',jobId,blocked:next.blocked,dependencies:taskBlockers(active.tasks||[]),progress:workerProgress(active)};if(next.task.status==='todo'){const changed=checkpointTask(active,next.task.id,{status:'in_progress'});await writeJob(changed,{expectedRevision:active.revision});return {status:'task_started',jobId,taskId:next.task.id,progress:workerProgress(changed)}}return {status:'task_in_progress',jobId,taskId:next.task.id,progress:workerProgress(active)}}
