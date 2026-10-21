import {operationKey} from './skynet-job-state.mjs';
import {validateDeployment} from './skynet-gabia-deploy-policy.mjs';
import {assertWriteTarget} from './skynet-write-safety.mjs';
import {appendJobEvent} from './skynet-job-events.mjs';
export function stagePreviewDeployment(job,{projectId,gitRef}){
 if(job.status!=='running')throw Error('JOB_NOT_RUNNING');
 if(!job.writeTargets?.gabiaProject||job.writeTargets.gabiaProject!==projectId)throw Error('DEPLOY_TARGET_NOT_APPROVED');
 if(!job.scopes?.includes('deployment:write'))throw Error('DEPLOY_SCOPE_REQUIRED');
 if(job.previewDeployment&&['pending_approval','executing','uncertain'].includes(job.previewDeployment.status))throw Error('DEPLOYMENT_ALREADY_ACTIVE');
 const args=validateDeployment({projectId,gitRef,target:'preview'});
 assertWriteTarget(job,'gabia.deploy',args);
 const step=(Number.isSafeInteger(job.proposalSequence)?job.proposalSequence:0)+1;
 if(step>1000000)throw Error('PROPOSAL_LIMIT');
 const key=operationKey(job.id,step,'gabia.deploy',args);
 return appendJobEvent({...job,proposalSequence:step,previewDeployment:{step,key,tool:'gabia.deploy',args,status:'pending_approval'}},'preview-deployment-staged',{projectId,gitRef});
}
export function reconcilePreviewDeployment(job){const p=job.previewDeployment;if(!p)throw Error('NO_PREVIEW_DEPLOYMENT');if(p.status==='deployed')return job;const op=job.operations?.[p.key];if(op?.status==='uncertain')return {...job,previewDeployment:{...p,status:'uncertain'}};if(op?.status!=='completed')return job;
 const id=op.result?.deploymentId;if(!op.result?.ok||typeof id!=='string'||!id)throw Error('DEPLOYMENT_RECEIPT_REQUIRED');
 return appendJobEvent({...job,previewDeployment:{...p,status:'deployed',deploymentId:id,url:op.result.url||null}},'preview-deployment-reconciled',{deploymentId:id});
}
