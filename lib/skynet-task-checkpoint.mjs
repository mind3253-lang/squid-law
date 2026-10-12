export function reconcileSkynetTasks(tasks,latestCommit){
 if(!Array.isArray(tasks)||!latestCommit)throw Error('INVALID_RECONCILIATION_INPUT');
 return tasks.map(task=>{
  if(task.status==='verified'&&task.verifiedCommit&&task.verifiedCommit!==latestCommit)return {...task,status:'in_progress',checkpoint:{...task.checkpoint,staleVerification:true}};
  return task;
 });
}
