// Read-only local deployment status; no secrets or customer data.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
function command(binary,args){
 try{return execFileSync(binary,args,{encoding:'utf8',timeout:2500,stdio:['ignore','pipe','ignore']}).trim();}
 catch{return null;}
}
const revision=command('git',['-C','/opt/squidlaw/app','rev-parse','HEAD']);
const timer=command('systemctl',['is-active','squidlaw-auto-update.timer']);
const worker=command('systemctl',['is-active','squidlaw-worker.service']);
const health=command('systemctl',['is-active','squidlaw-health.service']);
let lastResult=null;
try{
 const text=await readFile('/var/lib/squidlaw/auto-update-status.json','utf8');
 const parsed=JSON.parse(text);
 if(parsed&&typeof parsed==='object'){
  lastResult={outcome:parsed.outcome||'unknown',revision:parsed.revision||null,
   recordedAt:parsed.recordedAt||null};
 }
}catch{}
console.log(JSON.stringify({revision,timer:timer||'unavailable',worker:worker||'inactive',
 health:health||'unavailable',lastResult,customerApi:'NOT_CHECKED',database:'NOT_CHECKED',
 ai:'NOT_CHECKED'},null,2));
