import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('Naver account and SKYNET recall objects survive through the shared Gabia adapter',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'squidlaw-integration-'));
 try{
  const program=`
   import {put,get,list} from './lib/customer-object-storage.mjs';
   const objects=[
    ['squidlaw/users/test-account.json',JSON.stringify({id:'naver_test',provider:'naver'})],
    ['skynet/recall-batches/0123456789abcdef0123456789abcdef.json',JSON.stringify({expiresAt:Date.now()+30000,items:[{sources:[]} ]})]
   ];
   for(const [key,value] of objects)await put(key,value,{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   for(const [key,value] of objects){
    const item=await get(key,{access:'private'});
    if(!item||item.statusCode!==200)throw Error('OBJECT_NOT_FOUND '+key);
    const chunks=[];for await(const c of item.stream)chunks.push(c);
    if(Buffer.concat(chunks).toString()!==value)throw Error('OBJECT_CONTENT_MISMATCH '+key);
   }
   const recall=await list({prefix:'skynet/recall-batches/'});
   if(recall.blobs.length!==1||recall.blobs[0].pathname!==objects[1][0])throw Error('RECALL_LIST_MISMATCH');
   const account=await list({prefix:'squidlaw/users/'});
   if(account.blobs.length!==1||account.blobs[0].pathname!==objects[0][0])throw Error('ACCOUNT_LIST_MISMATCH');
   `;
  const run=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:process.cwd(),env:{...process.env,SQUIDLAW_OBJECT_ROOT:root,SQUIDLAW_OBJECT_BACKEND:'gabia'},encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
 }finally{await rm(root,{recursive:true,force:true})}
});
