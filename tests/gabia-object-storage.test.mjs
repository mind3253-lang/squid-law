import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('Gabia storage private object operations',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'squidlaw-objects-'));
 try{
  const code=`import {put,get,list} from './lib/customer-object-storage.mjs';
   const key='cases/test/report.json';
   await put(key,'hello',{access:'private',addRandomSuffix:false});
   const r=await get(key);
   const chunks=[];for await(const c of r.stream)chunks.push(c);
   if(Buffer.concat(chunks).toString()!=='hello')throw Error('read mismatch');
   const l=await list({prefix:'cases/test/'});
   if(l.blobs.length!==1||l.blobs[0].pathname!==key)throw Error('list mismatch');
   let rejected=false;
   try{await put(key,'again',{access:'private'})}catch(e){rejected=e.code==='EEXIST'}
   if(!rejected)throw Error('duplicate not rejected');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,SQUIDLAW_OBJECT_ROOT:dir,SQUIDLAW_OBJECT_BACKEND:'gabia'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }finally{await rm(dir,{recursive:true,force:true})}
});
