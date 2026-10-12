import {operationKey} from './skynet-job-state.mjs';
export function registerOperation(job,step,tool,input){const key=operationKey(job.id,step,tool,input);const operations=job.operations||{};if(operations[key]?.status==='completed')return {job,duplicate:true,key};return {job:{...job,operations:{...operations,[key]:{status:'pending',tool,step,at:new Date().toISOString()}}},duplicate:false,key}}
