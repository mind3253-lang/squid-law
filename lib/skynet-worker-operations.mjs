import {operationKey} from './skynet-job-state.mjs';
export function registerOperation(job,step,tool,input){const key=operationKey(job.id,step,tool,input);const operations=job.operations||{};if(operations[key]?.status==='completed')return {job,duplicate:true,key};return {job:{...job,operations:{...operations,[key]:{status:'pending',tool,step,at:new Date().toISOString()}}},duplicate:false,key}}

export function finishOperation(job,key,result){const previous=job.operations?.[key];if(!previous)throw Error('UNKNOWN_OPERATION');if(previous.status==='completed')throw Error('OPERATION_ALREADY_COMPLETED');return {...job,operations:{...job.operations,[key]:{...previous,status:'completed',result,completedAt:new Date().toISOString()}}}}

export function failOperation(job,key,reason){const op=job.operations?.[key];if(!op)throw Error('UNKNOWN_OPERATION');return {...job,operations:{...job.operations,[key]:{...op,status:'failed',reason:String(reason||'UNKNOWN').slice(0,300),failedAt:new Date().toISOString()}}}}
