// Redacted deployment events; never persist environment values or command output.
import {mkdir,appendFile,stat,rename} from 'node:fs/promises';
const dir='/var/lib/squidlaw';
const file=dir+'/deployment-events.jsonl';
const allowed=new Set(['applied','already_current','skipped_worker_active','skipped_local_changes','skipped_non_fast_forward','fetch_failed','update_failed','rollback_applied','rollback_failed']);
export async function recordDeploymentEvent({outcome,revision}){
 if(!allowed.has(outcome))throw Error('INVALID_DEPLOYMENT_OUTCOME');
 if(typeof revision!=='string'||!/^[a-f0-9]{40}$/.test(revision))throw Error('INVALID_DEPLOYMENT_REVISION');
 await mkdir(dir,{recursive:true,mode:0o700});
 try{if((await stat(file)).size>1048576)await rename(file,file+'.previous');}catch(e){if(e.code!=='ENOENT')throw e;}
 await appendFile(file,JSON.stringify({outcome,revision,at:new Date().toISOString()})+'\n',{mode:0o600});
}
