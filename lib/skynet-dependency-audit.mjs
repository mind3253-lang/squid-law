export function auditDependencies(tasks){const ids=new Set(tasks.map(t=>t.id));if(ids.size!==tasks.length)throw Error('DUPLICATE_TASK');return tasks.flatMap(t=>(t.dependsOn||[]).filter(id=>!ids.has(id)).map(id=>({task:t.id,missing:id})))}

export function readyDependencies(task,tasks){const byId=new Map(tasks.map(t=>[t.id,t.status]));return (task.dependsOn||[]).every(id=>byId.get(id)==='verified')}
