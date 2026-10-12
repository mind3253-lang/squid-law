import {runWorkerTick} from './skynet-worker-runner.mjs';
import {executeWorkerReadStep} from './skynet-worker-read-step.mjs';
import {batchReport} from './skynet-worker-batch-report.mjs';
export async function runWorkerBatch({jobId,owner,maxSteps=3}) {
 if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>4)throw Error('INVALID_STEP_LIMIT');
 const steps=[];
 for(let i=0;i<maxSteps;i++){
  const tick=await runWorkerTick({jobId,owner});
  steps.push(tick);
  if(!['task_started','task_in_progress'].includes(tick.status))break;
  if(tick.dispatch?.status!=='ready')break;
  const result=await executeWorkerReadStep({jobId,owner,taskId:tick.taskId});
  steps.push(result);
  if(result.status!=='tool_completed')break;
 }
 return batchReport(jobId,steps);
}
