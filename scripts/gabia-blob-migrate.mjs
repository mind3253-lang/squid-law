#!/usr/bin/env node
// Inventory / migrate private Vercel Blob objects into Gabia private storage.
// Default: inventory only. Explicit --copy required for writes.
// Run on a secured server with BLOB_READ_WRITE_TOKEN and SQUIDLAW_OBJECT_ROOT.
// Never prints object bodies, tokens, customer names or file contents.
import {createHash} from 'node:crypto';
import {get,list} from '@vercel/blob';
import {putPrivateObject,getPrivateObject} from '../lib/gabia-private-objects.mjs';
const copy=process.argv.includes('--copy');
const prefix=process.env.SQUIDLAW_MIGRATION_PREFIX||'';
const sha=b=>createHash('sha256').update(b).digest('hex');
let cursor,scanned=0,verified=0,bytes=0,errors=0;
do{
 const page=await list({prefix,limit:100,...(cursor?{cursor}:{})});
 for(const item of page.blobs){
  scanned++;
  if(!copy)continue;
  try{
   const remote=await get(item.pathname,{access:'private'});
   if(!remote||remote.statusCode!==200)throw Error('SOURCE_UNAVAILABLE');
   const chunks=[];let size=0;
   for await(const chunk of remote.stream){size+=chunk.length;if(size>200*1024*1024)throw Error('OBJECT_TOO_LARGE');chunks.push(Buffer.from(chunk))}
   const source=Buffer.concat(chunks);
   try{await putPrivateObject(item.pathname,source,{allowOverwrite:false})}
   catch(e){if(e.code!=='EEXIST')throw e}
   const local=await getPrivateObject(item.pathname);
   if(sha(source)!==sha(local))throw Error('CHECKSUM_MISMATCH');
   verified++;bytes+=source.length;
  }catch(e){errors++;console.error('MIGRATION_ERROR',sha(Buffer.from(item.pathname)).slice(0,12),String(e.code||e.message||'UNKNOWN').slice(0,80))}
 }
 cursor=page.hasMore?page.cursor:undefined;
}while(cursor);
console.log(JSON.stringify({mode:copy?'copy-and-verify':'inventory-only',scanned,verified,bytes,errors}));
if(copy&&(errors||scanned!==verified))process.exitCode=1;
