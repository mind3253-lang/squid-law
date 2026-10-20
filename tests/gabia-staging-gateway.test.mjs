import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';

async function freePort(){
 const server=net.createServer();
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}
test('Gabia staging API denies unmigrated routes and binds only loopback', {timeout:15000},async()=>{
 const port=await freePort();
 const child=spawn(process.execPath,['scripts/gabia-api-staging.mjs'],{
  env:{...process.env,SQUIDLAW_STAGING_API_PORT:String(port)},
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';
 child.stderr.on('data',chunk=>{stderr+=chunk.toString()});
 try{
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){
   if(child.exitCode!==null)throw Error('gateway exited early: '+stderr);
   try{const res=await fetch('http://127.0.0.1:'+port+'/__health');if(res.ok){ready=true;break}}catch{}
   await delay(80);
  }
  assert.equal(ready,true,'gateway did not start: '+stderr);
  const health=await fetch('http://127.0.0.1:'+port+'/__health');
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok',mode:'staging',migratedRoutes:0});
  for(const pathname of ['/api/skynet-chat','/api/customer-analysis-worker','/api/auth/naver/callback']){
   const response=await fetch('http://127.0.0.1:'+port+pathname,{method:'POST'});
   assert.equal(response.status,503,pathname);
   const body=await response.json();
   assert.equal(body.error,'API_MIGRATION_PENDING');
  }
 }finally{
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1500)]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
});
