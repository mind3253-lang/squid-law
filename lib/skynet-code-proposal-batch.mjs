import {assertSafeCodeTarget} from './skynet-code-proposal-security.mjs';
import {operationKey} from './skynet-job-state.mjs';
import {assertWriteTarget} from './skynet-write-safety.mjs';
import {validateGithubWrite} from './skynet-github-write.mjs';

const ACTIVE=new Set(['pending_approval','approved','executing','uncertain']);
export function stageProposalBatch(job,{taskId,proposals}){
 if(job.status!=='running'||!job.scopes?.includes('repository:write'))throw Error('WRITE_SCOPE_REQUIRED');
 if(!Array.isArray(proposals)||!proposals.length||proposals.length>12)throw Error('INVALID_PROPOSAL_BATCH');
 const task=job.tasks?.find(t=>t.id===taskId);
 if(!task||task.status!=='in_progress')throw Error('TASK_NOT_ELIGIBLE');
 if(job.codeProposalBatch?.items?.some(p=>ACTIVE.has(p.status)))throw Error('PROPOSAL_BATCH_ACTIVE');
 const seen=new Set();let step=Number.isSafeInteger(job.proposalSequence)?job.proposalSequence:0;
 const items=proposals.map(proposal=>{
  if(proposal?.tool!=='github.commit')throw Error('INVALID_PROPOSAL');
  const args=validateGithubWrite(proposal.args);assertSafeCodeTarget(args.path);assertWriteTarget(job,'github.commit',args);
  if(seen.has(args.path))throw Error('DUPLICATE_PROPOSAL_PATH');seen.add(args.path);
  if(++step>1000000)throw Error('PROPOSAL_LIMIT');
  return {tool:'github.commit',args,step,key:operationKey(job.id,step,'github.commit',args),status:'pending_approval'};
 });
 return {...job,proposalSequence:step,codeProposalBatch:{taskId,items,createdAt:new Date().toISOString()}};
}
export function batchProgress(job){const batch=job.codeProposalBatch;if(!batch)return null;return {taskId:batch.taskId,total:batch.items.length,committed:batch.items.filter(p=>p.status==='committed').length,pendingApproval:batch.items.filter(p=>p.status==='pending_approval').length,uncertain:batch.items.filter(p=>p.status==='uncertain').length,items:batch.items.map(({key,step,status,args,commitSha})=>({key,step,status,path:args.path,commitSha:commitSha||null}))}}
export function reconcileProposalBatch(job){const batch=job.codeProposalBatch;if(!batch)throw Error('NO_PROPOSAL_BATCH');let changed=false;
 const items=batch.items.map(p=>{if(p.status==='committed')return p;const op=job.operations?.[p.key];if(op?.status==='uncertain'||op?.status==='pending')return {...p,status:op.status};if(op?.status!=='completed')return p;
 const sha=op.result?.sha;if(!op.result?.ok||typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))throw Error('COMMIT_RECEIPT_REQUIRED');changed=true;return {...p,status:'committed',commitSha:sha,committedAt:new Date().toISOString()}});
 return changed?{...job,codeProposalBatch:{...batch,items}}:job;
}
