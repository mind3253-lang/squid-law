export function approvalRecord({tool,operationKey,actor,approved}){if(!tool||!operationKey||!actor||String(actor).length>80||typeof approved!=='boolean')throw Error('INVALID_APPROVAL');return {tool,operationKey,actor,approved,at:new Date().toISOString()}}
export function hasApproval(job,key){return (job.approvals||[]).some(a=>a.operationKey===key&&a.approved===true)}

export function approvalCount(job){return (job.approvals||[]).filter(a=>a.approved===true).length}
