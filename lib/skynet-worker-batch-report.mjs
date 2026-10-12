export function batchReport(jobId,steps){return {jobId,steps,stepCount:steps.length,stopped:steps.at(-1)?.status||'empty',completedTools:steps.filter(x=>x.status==='tool_completed').length}}
