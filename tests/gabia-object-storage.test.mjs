import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('Gabia object storage can write, read, list and reject duplicate writes',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'squidlaw-objects-'));
 try{
  const code="import {put,get,list} from './lib/customer-object-storage.mjs'; const p='cases/test/report.json'; await put(p,'hello',{access:'private',addRandomSuffix:false}); const r=await get(p); if((await new Promise(async(resolve,reject)=>{const chunks=[];for await(const c of r.stream)chunks.push(c);resolve(Buffer.concat(chunks).toString())}))!=='hello')throw Error('read mismatch'); const l=await list({prefix:'cases/test/'});if(l.blobs[0].pathname!==p)throw Error('list mismatch');let duplicate=false;try{await put(p,'again',{access:'private'})}catch(e){duplicate=e.code==='EEXIST'}if(!duplicate)throw Error('duplicate not rejected');";
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,SQUIDLAW_OBJECT_ROOT:dir,SQUIDLAW_OBJECT_BACKEND:'gabia'},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
 }finally{await rm(dir,{recursive:true,force:true})}
});
