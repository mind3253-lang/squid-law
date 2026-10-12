import {prepareStep} from './skynet-worker-step.mjs';
export function dispatchPlan(job,request){const result=prepareStep(job,request);if(!result.allowed)return {status:'blocked',reason:result.reason,job};if(result.duplicate)return {status:'already-completed',key:result.key,job};return {status:'prepared',key:result.key,job:result.job,tool:request.tool,args:request.args||{}}}
