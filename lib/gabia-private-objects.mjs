// VERCEL ZERO phase 2: local private-object backend for Gabia.
// This module does not change production storage routing until callers are migrated.
// Object keys are restricted to relative POSIX paths; no URLs, symlinks or dot segments.
import {open,readFile,readdir,mkdir,rename,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const ROOT=path.resolve(process.env.SQUIDLAW_OBJECT_ROOT||'/var/lib/squidlaw/objects');
function resolveKey(key){
 if(typeof key!=='string'||!key||key.length>1024||key.includes('\\')||key.includes(':')||key.startsWith('/')||key.includes('\0')||key.split('/').some(s=>!s||s==='.'||s==='..'||s.startsWith('.')))throw Error('INVALID_OBJECT_KEY');
 return path.join(ROOT,...key.split('/'));
}
async function assertNoSymlinks(key,{leaf=false}={}){
 const parts=key.split('/');
 let current=ROOT;
 try{if((await lstat(ROOT)).isSymbolicLink())throw Error('UNSAFE_OBJECT_ROOT')}catch(e){if(e.code!=='ENOENT')throw e}
 for(const part of (leaf?parts:parts.slice(0,-1))){
  current=path.join(current,part);
  try{if((await lstat(current)).isSymbolicLink())throw Error('SYMLINK_REJECTED')}catch(e){if(e.code!=='ENOENT')throw e}
 }
}
export async function putPrivateObject(key,body,{allowOverwrite=false}={}){
 const dest=resolveKey(key);
 await assertNoSymlinks(key,{leaf:true});
 await mkdir(path.dirname(dest),{recursive:true,mode:0o700});
 await assertNoSymlinks(key,{leaf:true});
 const bytes=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
 const temp=dest+'.tmp-'+randomUUID();
 const fh=await open(temp,'wx',0o600);
 try{await fh.writeFile(bytes);await fh.sync()}finally{await fh.close()}
 try{
  if(!allowOverwrite){
   // Hard-link publication is atomic and fails if the object already exists.
   const {link}=await import('node:fs/promises');
   await link(temp,dest);
  }else{
   await assertNoSymlinks(key,{leaf:true});
   await rename(temp,dest);
  }
 }finally{await rm(temp,{force:true})}
 return {pathname:key,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function getPrivateObject(key){
 const filename=resolveKey(key);
 await assertNoSymlinks(key,{leaf:true});
 const st=await lstat(filename);
 if(!st.isFile()||st.isSymbolicLink())throw Error('INVALID_OBJECT_TYPE');
 const handle=await open(filename,'r');
 try{
  const opened=await handle.stat();
  if(!opened.isFile()||opened.ino!==st.ino||opened.dev!==st.dev)throw Error('OBJECT_CHANGED_DURING_READ');
  return await handle.readFile();
 }finally{await handle.close()}
}
export async function listPrivateObjects(prefix='',{limit=1000,cursor}={}){
 if(prefix)resolveKey(prefix.endsWith('/')?prefix.slice(0,-1):prefix);
 if(cursor!==undefined&&(typeof cursor!=='string'||!cursor.startsWith(prefix)))throw Error('INVALID_CURSOR');
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('INVALID_LIST_LIMIT');
 const keys=[];
 async function walk(dir,rel){
  for(const d of await readdir(dir,{withFileTypes:true})){
   if(d.name.startsWith('.')||d.isSymbolicLink())continue;
   const key=rel?rel+'/'+d.name:d.name;
   if(d.isDirectory())await walk(path.join(dir,d.name),key);
   else if(d.isFile()&&key.startsWith(prefix))keys.push(key);
  }
 }
 try{await walk(ROOT,'')}catch(e){if(e.code!=='ENOENT')throw e}
 keys.sort();
 const filtered=cursor?keys.filter(k=>k>cursor):keys;
 const page=filtered.slice(0,limit);
 const objects=await Promise.all(page.map(async pathname=>{const st=await lstat(resolveKey(pathname));return {pathname,size:st.size,uploadedAt:st.mtime.toISOString()}}));
 return {objects,cursor:filtered.length>limit?page.at(-1):undefined,hasMore:filtered.length>limit};
}
export function objectRoot(){return ROOT}

/**
 * Stream a large immutable object to disk with bounded memory.
 * An existing destination is never overwritten. Failed streams remove temp data.
 */
export async function putPrivateObjectStream(key,source,{allowOverwrite=false}={}){
 if(allowOverwrite)throw Error('STREAM_OVERWRITE_NOT_ALLOWED');
 const {pipeline}=await import('node:stream/promises');
 const {Readable,Transform}=await import('node:stream');
 const {createWriteStream}=await import('node:fs');
 const {link}=await import('node:fs/promises');
 const dest=resolveKey(key);
 await assertNoSymlinks(key,{leaf:true});
 await mkdir(path.dirname(dest),{recursive:true,mode:0o700});
 await assertNoSymlinks(key,{leaf:true});
 const temp=dest+'.tmp-'+randomUUID();
 const hash=createHash('sha256');let size=0;
 const counter=new Transform({transform(chunk,encoding,callback){
  size+=chunk.length;hash.update(chunk);callback(null,chunk);
 }});
 try{
  await pipeline(Readable.from(source),counter,createWriteStream(temp,{flags:'wx',mode:0o600}));
  await assertNoSymlinks(key,{leaf:true});
  try{await link(temp,dest)}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   const existing=await hashPrivateObject(key);
   const expected=hash.digest('hex');
   if(existing.size!==size||existing.sha256!==expected)throw Error('DESTINATION_CONFLICT');
   return {pathname:key,size,sha256:expected,alreadyPresent:true};
  }
  return {pathname:key,size,sha256:hash.digest('hex')};
 }finally{await rm(temp,{force:true})}
}
export async function hashPrivateObject(key){
 const {createReadStream}=await import('node:fs');
 const filename=resolveKey(key);
 await assertNoSymlinks(key,{leaf:true});
 const st=await lstat(filename);
 if(!st.isFile()||st.isSymbolicLink())throw Error('INVALID_OBJECT_TYPE');
 const hash=createHash('sha256');let size=0;
 for await(const chunk of createReadStream(filename,{flags:'r'})){hash.update(chunk);size+=chunk.length}
 const after=await lstat(filename);
 if(after.ino!==st.ino||after.dev!==st.dev||after.size!==st.size)throw Error('OBJECT_CHANGED_DURING_HASH');
 return {pathname:key,size,sha256:hash.digest('hex')};
}
