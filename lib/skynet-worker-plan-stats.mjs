export function planStats(tasks){return {tasks:tasks.length,toolCalls:tasks.reduce((n,t)=>n+(t.toolCalls?.length||0),0),withDependencies:tasks.filter(t=>(t.dependsOn||[]).length>0).length}}
