export function withinBudget(job,{operations=0,tokens=0}={}){if(!Number.isFinite(operations)||!Number.isFinite(tokens)||operations<0||tokens<0)throw Error('INVALID_USAGE_COUNTER');const limits=job.limits||{};return {operations:operations<Math.min(1000,limits.maxOperations||100),tokens:tokens<Math.min(10000000,limits.maxTokens||1000000)}}

export function remainingBudget(job,used){const max=job.limits?.maxOperations||100;return Math.max(0,max-(used.operations||0))}
