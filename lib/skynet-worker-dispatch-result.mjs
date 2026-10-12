export function dispatchResult(job,task,dispatch){return {jobId:job.id,taskId:task.id,dispatch:dispatch||{status:'manual_task'},revision:job.revision}}
