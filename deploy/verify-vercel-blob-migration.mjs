// Read-only final inventory and SHA-256 validation against Vercel Blob migration journal.
import {list} from '@vercel/blob';
import {readFile} from 'node:fs/promises';
import {hashPrivateObject} from '../lib/gabia-private-objects.mjs';
const token=process.env.BLOB_READ_WRITE_TOKEN;
if(!token)throw Error('MISSING_BLOB_TOKEN');
const journal='/var/lib/squidlaw/blob-migration/journal.jsonl';
const verified=new Map();
for(const line of (await readFile(journal,'utf8')).split('\n')){
 if(!line.trim())continue;
 const x=JSON.parse(line);
 if(x.status==='ok')verified.set(x.pathname,{size:x.sourceSize,sha256:x.sha256});
 if(x.status==='conflict-staged')verified.set(x.pathname,{size:x.sourceSize,sha256:x.sourceSha256});
}
let cursor,listed=0,passed=0,failed=0,totalBytes=0;
const seen=new Set();
do{
 const page=await list({token,limit:1000,...(cursor?{cursor}:{})});
 for(const b of page.blobs){
  if(seen.has(b.pathname))continue;
  seen.add(b.pathname);listed++;
  try{
   const expected=verified.get(b.pathname);
   if(!expected)throw Error('MISSING_VERIFIED_SOURCE_JOURNAL');
   if(expected.size!==b.size)throw Error('SOURCE_SIZE_CHANGED');
   const actual=await hashPrivateObject(b.pathname);
   if(actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('HASH_MISMATCH');
   passed++;totalBytes+=actual.size;
  }catch(e){failed++;console.error('VERIFY_FAILED',b.pathname,String(e.message))}
 }
 console.log('VERIFY_PROGRESS',JSON.stringify({listed,passed,failed,totalBytes}));
 if(page.hasMore&&(!page.cursor||page.cursor===cursor))throw Error('INVALID_PAGINATION_CURSOR');
 cursor=page.hasMore?page.cursor:undefined;
}while(cursor);
console.log('VERIFY_FINAL',JSON.stringify({listed,passed,failed,totalBytes}));
if(failed)process.exitCode=2;
