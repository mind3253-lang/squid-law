#!/usr/bin/env node
// Read-only inventory by default. --copy streams Vercel Blob objects to Gabia.
// No customer content, keys or credentials are written to stdout.
import {createHash} from 'node:crypto';
import {get,list} from '@vercel/blob';
import {putPrivateObjectStream,hashPrivateObject} from '../lib/gabia-private-objects.mjs';
const copy=process.argv.includes('--copy');
const prefix=process.env.SQUIDLAW_MIGRATION_PREFIX||'';
const BATCH=200*1024*1024;
if(copy&&(!process.env.BLOB_READ_WRITE_TOKEN||!process.env.SQUIDLAW_OBJECT_ROOT))throw Error('MIGRATION_CREDENTIALS_OR_DESTINATION_MISSING');
let cursor,scanned=0,verified=0,bytes=0,errors=0,batches=0,batchBytes=0,oversize=0,sourceBytes=0,unknownSize=0,largestObjectBytes=0;
const failures=[];
do{
 const page=await list({prefix,limit:100,...(cursor?{cursor}:{})});
 for(const item of page.blobs){
  scanned++;
  if(Number.isSafeInteger(item.size)&&item.size>=0){sourceBytes+=item.size;largestObjectBytes=Math.max(largestObjectBytes,item.size)}
  else unknownSize++;
  if(!copy)continue;
  try{
   const remote=await get(item.pathname,{access:'private'});
   if(!remote||remote.statusCode!==200)throw Error('SOURCE_UNAVAILABLE');
   // 200 MB is a reporting batch target, NOT a per-file cap.
   // A 500 MB document is transferred as a single bounded-memory stream.
   const written=await putPrivateObjectStream(item.pathname,remote.stream,{allowOverwrite:false});
   const local=await hashPrivateObject(item.pathname);
   if(written.sha256!==local.sha256||written.size!==local.size)throw Error('CHECKSUM_MISMATCH');
   verified++;bytes+=written.size;
   batchBytes+=written.size;
   if(batchBytes>=BATCH){batches++;batchBytes=0}
  }catch(e){
   errors++;
   if(String(e.code||e.message)==='OBJECT_TOO_LARGE')oversize++;
   const id=createHash('sha256').update(item.pathname).digest('hex').slice(0,12);
   failures.push({id,error:String(e.code||e.message||'UNKNOWN').slice(0,80)});
   console.error('MIGRATION_ERROR',id,String(e.code||e.message||'UNKNOWN').slice(0,80));
  }
 }
 cursor=page.hasMore?page.cursor:undefined;
}while(cursor);
if(copy&&batchBytes)batches++;
console.log(JSON.stringify({mode:copy?'copy-and-verify':'inventory-only',scanned,sourceBytes,unknownSize,largestObjectBytes,verified,bytes,errors,batches,oversize,failures}));
if(copy&&(errors||scanned!==verified))process.exitCode=1;
