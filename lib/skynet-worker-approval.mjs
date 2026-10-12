export function approvalRecord({tool,operationKey,actor,approved}){if(!tool||!operationKey||!actor||typeof approved!=='boolean')throw Error('INVALID_APPROVAL');return {tool,operationKey,actor,approved,at:new Date().toISOString()}}
export function hasApproval(job,key){return (job.approvals||[]).some(a=>a.operationKey===key&&a.approved===true)}
