import {operationKey} from './skynet-job-state.mjs';
import {assertWriteTarget} from './skynet-write-safety.mjs';

export function stageCodeProposal(job,{taskId,proposal}){
 if(job.status!=='running')throw Error('JOB_NOT_RUNNING');
 if(!job.scopes?.includes('repository:write'))throw Error('WRITE_SCOPE_REQUIRED');
 if(!proposal||proposal.tool!=='github.commit')throw Error('INVALID_PROPOSAL');
 assertWriteTarget(job,proposal.tool,proposal.args);
 const task=job.tasks?.find(t=>t.id===taskId);
 if(!task||task.status!=='in_progress')throw Error('TASK_NOT_ELIGIBLE');
 if(job.codeProposal&&['pending_approval','approved','executing','uncertain'].includes(job.codeProposal.status))throw Error('PROPOSAL_ALREADY_EXISTS');
 const step=Number.isSafeInteger(job.proposalSequence)?job.proposalSequence+1:1;
 if(step>1000000)throw Error('PROPOSAL_LIMIT');
 const key=operationKey(job.id,step,proposal.tool,proposal.args);
 return {...job,proposalSequence:step,codeProposal:{...proposal,taskId,step,key,status:'pending_approval',createdAt:new Date().toISOString()}};
}
export function approvedCodeProposal(job){
 const p=job.codeProposal;
 if(!p||p.status!=='pending_approval')throw Error('NO_PENDING_PROPOSAL');
 if(!(job.approvals||[]).some(a=>a.operationKey===p.key&&a.approved===true))throw Error('APPROVAL_REQUIRED');
 assertWriteTarget(job,p.tool,p.args);
 return {jobId:job.id,owner:job.owner,step:p.step,tool:p.tool,args:p.args,approved:true};
}
export function codeProposalReceipt(job,key,result){
 const p=job.codeProposal;
 if(!p||p.key!==key)throw Error('PROPOSAL_OPERATION_MISMATCH');
 if(job.operations?.[key]?.status!=='completed')throw Error('WRITE_NOT_COMPLETED');
 const sha=result?.sha||result?.commitSha||job.operations[key]?.result?.sha||job.operations[key]?.result?.commitSha;
 if(job.operations[key]?.result?.ok!==true||typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha)||sha!==job.operations[key]?.result?.sha)throw Error('COMMIT_SHA_REQUIRED');
 return {...job,codeProposal:{...p,status:'committed',commitSha:sha,committedAt:new Date().toISOString()}};
}
