import {createHash} from 'node:crypto';
export const STATUSES=['queued','running','blocked','completed','failed','cancelled'];
const transitions={queued:['running','blocked','cancelled'],running:['queued','blocked','completed','failed','cancelled'],blocked:['queued','cancelled'],failed:['queued','cancelled'],completed:[],cancelled:[]};
export function transitionJob(job,next,{checkpoint,reason,owner}={}){
 if(!job||!transitions[job.status]?.includes(next))throw Error('INVALID_JOB_TRANSITION');
 if(job.status==='running'&&job.owner&&job.owner!==owner)throw Error('JOB_OWNER_MISMATCH');
 if(next==='completed'&&(!checkpoint?.verified||!Array.isArray(checkpoint.evidence)||!checkpoint.evidence.length))throw Error('COMPLETION_EVIDENCE_REQUIRED');
 if(next==='blocked'&&!reason)throw Error('BLOCK_REASON_REQUIRED');
 return {...job,status:next,checkpoint:checkpoint??job.checkpoint??null,reason:reason??null,owner:next==='running'?owner??job.owner:null,updatedAt:new Date().toISOString()};
}
export function operationKey(jobId,step,tool,input){
 if(!jobId||!Number.isSafeInteger(step)||step<0||!tool)throw Error('INVALID_OPERATION');
 return createHash('sha256').update(JSON.stringify([jobId,step,tool,input])).digest('hex');
}
export function unfinishedTasks(tasks){
 const map=new Map(tasks.map(t=>[t.id,t]));
 if(map.size!==tasks.length)throw Error('DUPLICATE_TASK');
 if(tasks.some(t=>(t.dependsOn||[]).some(id=>!map.has(id))))throw Error('UNKNOWN_TASK_DEPENDENCY');
 return tasks.filter(t=>t.status!=='verified'&&t.status!=='blocked'&&(t.dependsOn||[]).every(id=>map.get(id)?.status==='verified')).sort((a,b)=>String(a.priority||'P2').localeCompare(String(b.priority||'P2'))||a.id.localeCompare(b.id));
}

export function terminalStatus(status){return status==='completed'||status==='failed'||status==='cancelled'}
