// Copy Vercel Blob objects to Gabia in bounded, resumable batches.
// Run on Gabia only. Never delete source objects or overwrite local objects.
import {list,get} from '@vercel/blob';
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {putPrivateObjectStream,hashPrivateObject} from '../lib/gabia-private-objects.mjs';

const token=process.env.BLOB_READ_WRITE_TOKEN;
if(!token)throw Error('BLOB_READ_WRITE_TOKEN_REQUIRED');
const root=process.env.SQUIDLAW_MIGRATION_STATE_ROOT||'/var/lib/squidlaw/migration';
const maxBytes=200*1024*1024;
await mkdir(root,{recursive:true,mode:0o700});
const stateFile=join(root,'vercel-blob-checkpoint.json');
let state={cursor:undefined,index:0,completed:false,totalBytes:0,totalObjects:0};
try{state={...state,...JSON.parse(await readFile(stateFile,'utf8'))}}catch(e){if(e.code!=='ENOENT')throw e}
async function save(){
 const temp=stateFile+'.'+randomUUID();
 await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600,flag:'wx'});
 await rename(temp,stateFile);
}
let batchBytes=0,batchObjects=0,skipped=0;
while(!state.completed){
 const page=await list({token,limit:100,cursor:state.cursor||undefined});
 const blobs=page.blobs||[];
 for(let i=state.index;i<blobs.length;i++){
  const blob=blobs[i],key=blob.pathname;
  if(typeof key!=='string'||!key)throw Error('INVALID_BLOB_PATHNAME');
  const size=Number(blob.size);
  if(!Number.isSafeInteger(size)||size<0)throw Error('INVALID_BLOB_SIZE');
  if(batchObjects>0&&batchBytes+size>maxBytes){
   console.log(JSON.stringify({status:'BATCH_LIMIT',batchBytes,batchObjects,skipped,next:key}));
   process.exit(0);
  }
  let exists=false;
  try{
   const local=await hashPrivateObject(key);
   if(local.size!==size)throw Error('EXISTING_OBJECT_SIZE_MISMATCH:'+key);
   exists=true;
  }catch(e){if(e.code!=='ENOENT')throw e}
  if(!exists){
   const response=await get(blob.url,{token,access:'private'});
   if(!response||!response.stream)throw Error('BLOB_DOWNLOAD_FAILED:'+key);
   const copied=await putPrivateObjectStream(key,response.stream);
   if(copied.size!==size)throw Error('COPIED_SIZE_MISMATCH:'+key);
   batchBytes+=size;batchObjects++;
  }else skipped++;
  state.totalBytes+=exists?0:size;
  state.totalObjects+=exists?0:1;
  state.index=i+1;
  await save();
 }
 if(!page.hasMore){state.completed=true;await save();break}
 if(!page.cursor||page.cursor===state.cursor)throw Error('INVALID_NEXT_CURSOR');
 state.cursor=page.cursor;state.index=0;await save();
}
console.log(JSON.stringify({status:state.completed?'COMPLETE':'BATCH_LIMIT',batchBytes,batchObjects,skipped,totalBytes:state.totalBytes,totalObjects:state.totalObjects}));
