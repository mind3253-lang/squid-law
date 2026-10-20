import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
test('staging static server blocks symlink escape and private directories',{timeout:15000},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'gabia-static-'));
 const outside=await mkdtemp(path.join(tmpdir(),'gabia-secret-'));
 const portServer=net.createServer();
 await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
 const port=portServer.address().port;
 await new Promise(resolve=>portServer.close(resolve));
 await writeFile(path.join(root,'index.html'),'public');
 await writeFile(path.join(outside,'secret.txt'),'private');
 await symlink(path.join(outside,'secret.txt'),path.join(root,'escape.txt'));
 await mkdir(path.join(root,'docs'));
 await writeFile(path.join(root,'docs','sensitive.txt'),'private');
 const child=spawn(process.execPath,['scripts/gabia-static-staging.mjs'],{env:{...process.env,SQUIDLAW_WEB_ROOT:root,SQUIDLAW_WEB_PORT:String(port),SQUIDLAW_WEB_HOST:'0.0.0.0'},stdio:'ignore'});
 try{
  let started=false;
  for(let i=0;i<80;i++){
   try{if((await fetch('http://127.0.0.1:'+port+'/__health')).ok){started=true;break}}catch{}
   await delay(80);
  }
  assert.ok(started,'server failed to start');
  const get=p=>fetch('http://127.0.0.1:'+port+p);
  assert.equal((await get('/index.html')).status,200);
  assert.equal((await get('/escape.txt')).status,404);
  assert.equal((await get('/docs/sensitive.txt')).status,404);
  await writeFile(path.join(root,'leaked.pem'),'private');
  assert.equal((await get('/leaked.pem')).status,404);
  await writeFile(path.join(root,'leaked.sql'),'private');
  assert.equal((await get('/leaked.sql')).status,404);
  await writeFile(path.join(root,'private.key'),'private');
  assert.equal((await get('/private.key')).status,404);
  assert.equal((await get('/api/skynet-chat')).status,503);
 }finally{
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1000)]);
  await Promise.all([rm(root,{recursive:true,force:true}),rm(outside,{recursive:true,force:true})]);
 }
});
