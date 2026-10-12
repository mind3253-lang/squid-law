export function taskToolIds(tasks){return tasks.flatMap(t=>(t.toolCalls||[]).map((c,i)=>({taskId:t.id,index:i,name:c.name})))}
