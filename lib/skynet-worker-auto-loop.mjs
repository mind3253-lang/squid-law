import {runWorkerTick} from './skynet-worker-runner.mjs';
import {executeWorkerReadStep} from './skynet-worker-read-step.mjs';
import {batchReport} from './skynet-worker-batch-report.mjs';
import {batchStopReason} from './skynet-worker-stop-reason.mjs';
export async function runWorkerBatch({jobId,owner,maxSteps=3}) {
 if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>4)throw Error('INVALID_STEP_LIMIT');
 const steps=[];const deadline=Date.now()+40000;
 for(let i=0;i<maxSteps&&Date.now()<deadline;i++){
  const tick=await runWorkerTick({jobId,owner});
  steps.push(tick);
  if(!['task_started','task_in_progress'].includes(tick.status))break;
  if(tick.dispatch?.status!=='ready')break;
  const result=await executeWorkerReadStep({jobId,owner,taskId:tick.taskId});
  steps.push(result);
  if(result.status!=='tool_completed')break;
 }
 return {...batchReport(jobId,steps),reason:Date.now()>=deadline?'deadline':batchStopReason(steps.filter(x=>x.dispatch||x.status==='waiting'||x.status==='completed').at(-1))};
}
