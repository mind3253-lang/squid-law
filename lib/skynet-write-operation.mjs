import {operationKey} from './skynet-job-state.mjs';
import {validateWriteRequest} from './skynet-write-request.mjs';
import {assertWriteTarget} from './skynet-write-safety.mjs';
export function prepareWriteOperation(job,request){const b=validateWriteRequest(request);if(job.id!==b.jobId||job.owner!==b.owner||job.status!=='running'||!(Date.parse(job.leaseUntil)>Date.now()))throw Error('OWNER_MISMATCH');assertWriteTarget(job,b.tool,b.args);const key=operationKey(job.id,b.step,b.tool,b.args);const approval=(job.approvals||[]).find(a=>a.operationKey===key&&a.approved===true);if(!approval)throw Error('APPROVAL_REQUIRED');return {key,approval}}
