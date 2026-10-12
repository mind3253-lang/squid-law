export function taskReady(job,task){const tasks=new Map((job.tasks||[]).map(t=>[t.id,t]));return (task.dependsOn||[]).every(id=>tasks.get(id)?.status==='verified')}
