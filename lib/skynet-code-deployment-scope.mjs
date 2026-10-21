import {appendJobEvent} from './skynet-job-events.mjs';
export function enablePreviewDeployment(job,{projectId}){
 if(!['queued','running'].includes(job.status))throw Error('JOB_NOT_EDITABLE');
 if(projectId!=='squid-law')throw Error('INVALID_PROJECT');
 if(job.writeTargets?.gabiaProject&&job.writeTargets.gabiaProject!==projectId)throw Error('DEPLOY_TARGET_MISMATCH');
 return appendJobEvent({...job,scopes:[...new Set([...(job.scopes||[]),'deployment:write','deployment:read'])],writeTargets:{...job.writeTargets,gabiaProject:projectId}},'preview-deployment-enabled',{projectId});
}
