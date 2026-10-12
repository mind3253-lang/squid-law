import {finishOperation,failOperation} from './skynet-worker-operations.mjs';
export function recordOutcome(job,key,{ok,result,error}){return ok?finishOperation(job,key,result):failOperation(job,key,error)}
