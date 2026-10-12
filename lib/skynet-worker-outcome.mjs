import {finishOperation,failOperation} from './skynet-worker-operations.mjs';
export function recordOutcome(job,key,{ok,result,error}){return ok?finishOperation(job,key,result):failOperation(job,key,error)}

export function retryableOutcome(error){return ['TIMEOUT','RATE_LIMIT','UPSTREAM_UNAVAILABLE'].includes(String(error?.code||error))}
