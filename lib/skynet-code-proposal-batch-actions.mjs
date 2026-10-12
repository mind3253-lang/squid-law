import {operationKey} from './skynet-job-state.mjs';
import {assertWriteTarget} from './skynet-write-safety.mjs';
export function proposalBatchActions(job){const batch=job.codeProposalBatch;if(!batch)return [];
 return batch.items.map(p=>{
  const operation=job.operations?.[p.key];const approval=(job.approvals||[]).find(a=>a.operationKey===p.key&&a.approved===true);
  if(operation?.status==='completed')return {step:p.step,key:p.key,path:p.args.path,status:'awaiting_reconciliation'};
  if(operation?.status==='pending'||operation?.status==='uncertain'||operation?.status==='failed')return {step:p.step,key:p.key,path:p.args.path,status:'manual_review_required'};
  if(p.status==='committed')return {step:p.step,key:p.key,path:p.args.path,status:'committed'};
  if(operationKey(job.id,p.step,p.tool,p.args)!==p.key)throw Error('PROPOSAL_OPERATION_MISMATCH');assertWriteTarget(job,p.tool,p.args);
  return {step:p.step,key:p.key,path:p.args.path,status:approval?'ready_for_lock_and_write':'approval_required',tool:p.tool,args:p.args,approved:Boolean(approval),owner:job.owner};
 });
}
