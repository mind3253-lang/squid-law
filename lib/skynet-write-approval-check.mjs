import {operationKey} from './skynet-job-state.mjs';
export function hasWriteApproval(job,{step,tool,args}){const key=operationKey(job.id,step,tool,args);return (job.approvals||[]).some(x=>x.operationKey===key&&x.approved===true)}
