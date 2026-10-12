import {appendJobEvent} from './skynet-job-events.mjs';
export function enablePreviewDeployment(job,{projectId}){
 if(!['queued','running'].includes(job.status))throw Error('JOB_NOT_EDITABLE');
 if(!/^[A-Za-z0-9_-]{8,120}$/.test(projectId||''))throw Error('INVALID_PROJECT');
 if(job.writeTargets?.vercelProject&&job.writeTargets.vercelProject!==projectId)throw Error('DEPLOY_TARGET_MISMATCH');
 return appendJobEvent({...job,scopes:[...new Set([...(job.scopes||[]),'deployment:write','deployment:read'])],writeTargets:{...job.writeTargets,vercelProject:projectId}},'preview-deployment-enabled',{projectId});
}
