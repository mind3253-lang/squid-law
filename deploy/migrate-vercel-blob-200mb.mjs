// Read-only Vercel Blob to Gabia migration. No database or DNS operations.
import {list,get} from '@vercel/blob';
import {mkdir,readFile,appendFile,open,rename,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashPrivateObject,putPrivateObjectStream} from '../lib/gabia-private-objects.mjs';
const limit=200*1024*1024;
const state='/var/lib/squidlaw/blob-migration';
const token=process.env.BLOB_READ_WRITE_TOKEN;
if(!token)throw Error('BLOB_READ_WRITE_TOKEN is not configured on Gabia');
await mkdir(state,{recursive:true,mode:0o700});
const journal=state+'/journal.jsonl';
let done=new Map();
try{for(const line of (await readFile(journal,'utf8')).split('\n')){if(line.trim()){const v=JSON.parse(line);if(v.status==='ok')done.set(v.pathname,v);}}}catch(e){if(e.code!=='ENOENT')throw e}
const stats={listed:0,completed:0,skipped:0,conflicts:0,failed:0,bytes:0,batches:0};
let batch=0,cursor,seen=new Set();
async function record(v){await appendFile(journal,JSON.stringify({...v,at:new Date().toISOString()})+'\n',{mode:0o600})}
async function stageConflict(key,b){
 const directory=state+'/conflicts';
 await mkdir(directory,{recursive:true,mode:0o700});
 const filename=directory+'/'+createHash('sha256').update(key).digest('hex');
 const obj=await get(key,{token,access:'private'});
 if(!obj?.stream)throw Error('CONFLICT_SOURCE_STREAM_UNAVAILABLE');
 const temp=filename+'.part-'+process.pid;
 const digest=createHash('sha256');let size=0;
 try{
  await pipeline(Readable.from(obj.stream),new Transform({transform(chunk,enc,cb){size+=chunk.length;digest.update(chunk);cb(null,chunk)}}),createWriteStream(temp,{flags:'wx',mode:0o600}));
  if(size!==b.size)throw Error('CONFLICT_SOURCE_SIZE_MISMATCH');
  const sourceSha256=digest.digest('hex');
  const target=await hashPrivateObject(key);
  await rename(temp,filename);
  await record({status:'conflict-staged',pathname:key,sourceSize:size,sourceSha256,targetSize:target.size,targetSha256:target.sha256,stagedPath:filename});
  console.log('CONFLICT_STAGED',key,JSON.stringify({sourceSize:size,sourceSha256,targetSize:target.size,targetSha256:target.sha256}));
 }finally{await rm(temp,{force:true})}
}
async function migrate(b){
 const key=b.pathname;
 if(!key||key.startsWith('/')||key.includes('..')||key.includes('\\')||key.includes(':'))throw Error('UNSAFE_KEY');
 const previous=done.get(key);
 if(previous&&previous.sourceSize===b.size){
   const local=await hashPrivateObject(key).catch(e=>{if(e.code==='ENOENT')return null;throw e});
   if(local&&local.sha256===previous.sha256&&local.size===b.size){stats.skipped++;return}
 }
 let last;
 for(let attempt=1;attempt<=4;attempt++){
  try{
   const obj=await get(key,{token,access:'private'});
   if(!obj||!obj.stream)throw Error('SOURCE_STREAM_UNAVAILABLE');
   const result=await putPrivateObjectStream(key,obj.stream);
   if(result.size!==b.size)throw Error('SOURCE_SIZE_MISMATCH');
   const verify=await hashPrivateObject(key);
   if(verify.sha256!==result.sha256||verify.size!==b.size)throw Error('DESTINATION_VERIFY_FAILED');
   await record({status:'ok',pathname:key,sourceSize:b.size,sha256:verify.sha256});
   done.set(key,{sourceSize:b.size,sha256:verify.sha256});
   stats.completed++;stats.bytes+=b.size;return;
  }catch(e){
   last=e;
   if(e.message==='DESTINATION_CONFLICT'){
    stats.conflicts++;
    try{await stageConflict(key,b)}catch(stageError){stats.failed++;await record({status:'conflict-stage-failed',pathname:key,error:String(stageError.message)});console.error('CONFLICT_STAGE_FAILED',key,String(stageError.message))}
    console.error('CONFLICT_PRESERVED',key);
    return;
   }
   if(attempt<4)await new Promise(r=>setTimeout(r,Math.min(8000,500*2**attempt)));
  }
 }
 stats.failed++;await record({status:'failed',pathname:key,error:String(last?.message||last)});console.error('FAILED',key,String(last));
}
async function flush(items){if(!items.length)return;stats.batches++;for(const b of items)await migrate(b);console.log('BATCH',JSON.stringify(stats))}
let items=[];
do{
 const page=await list({token,limit:1000,...(cursor?{cursor}:{})});
 for(const b of page.blobs){
  if(seen.has(b.pathname))continue;
  seen.add(b.pathname);stats.listed++;
  if(items.length&&batch+b.size>limit){await flush(items);items=[];batch=0}
  items.push(b);batch+=b.size;
  if(batch>=limit){await flush(items);items=[];batch=0}
 }
 if(page.hasMore&&(!page.cursor||page.cursor===cursor))throw Error('INVALID_PAGINATION_CURSOR');
 cursor=page.hasMore?page.cursor:undefined;
}while(cursor);
await flush(items);
console.log('FINAL',JSON.stringify({...stats,remaining:stats.failed+stats.conflicts}));
if(stats.failed||stats.conflicts)process.exitCode=2;
