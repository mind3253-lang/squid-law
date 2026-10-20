// Restore only five verified zero-byte migration placeholders from staged source files.
// Never delete the original placeholder; no Vercel, Neon, DNS, or runtime changes.
import {readFile,stat,open,copyFile,rename,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {hashPrivateObject} from '../lib/gabia-private-objects.mjs';
const base='/var/lib/squidlaw/blob-migration';
const root='/var/lib/squidlaw/objects';
const entries=(await readFile(base+'/journal.jsonl','utf8')).split('\n').filter(Boolean).map(x=>JSON.parse(x));
const staged=new Map(entries.filter(x=>x.status==='conflict-staged').map(x=>[x.pathname,x]));
if(staged.size!==5)throw Error('EXPECTED_EXACTLY_FIVE_STAGED_CONFLICTS');
let restored=0;
for(const [key,e] of staged){
 if(!key||key.startsWith('/')||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('UNSAFE_KEY');
 const expected=base+'/conflicts/'+createHash('sha256').update(key).digest('hex');
 if(e.stagedPath!==expected)throw Error('UNEXPECTED_STAGING_PATH');
 const stagedHash=await hashFile(expected);
 if(stagedHash.size!==e.sourceSize||stagedHash.sha256!==e.sourceSha256)throw Error('STAGED_HASH_MISMATCH:'+key);
 const dest=path.join(root,...key.split('/'));
 const current=await hashPrivateObject(key);
 if(current.size===e.sourceSize&&current.sha256===e.sourceSha256){console.log('ALREADY_RESTORED',key);continue}
 if(current.size!==0||current.sha256!=='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')throw Error('NONEMPTY_DESTINATION_REFUSED:'+key);
 const backup=base+'/zero-byte-backups/'+createHash('sha256').update(key).digest('hex');
 await mkdir(path.dirname(backup),{recursive:true,mode:0o700});
 await copyFile(dest,backup,1);
 const temp=dest+'.verified-restore-'+process.pid;
 await copyFile(expected,temp,1);
 try{
  const check=await hashFile(temp);
  if(check.sha256!==e.sourceSha256||check.size!==e.sourceSize)throw Error('TEMP_HASH_MISMATCH');
  const again=await hashPrivateObject(key);
  if(again.size!==0||again.sha256!==current.sha256)throw Error('DESTINATION_CHANGED');
  await rename(temp,dest);
  const final=await hashPrivateObject(key);
  if(final.sha256!==e.sourceSha256||final.size!==e.sourceSize)throw Error('RESTORE_VERIFY_FAILED');
  console.log('RESTORED_VERIFIED',key,final.size,final.sha256);restored++;
 }catch(err){throw err}
}
console.log('REPAIR_FINAL',JSON.stringify({staged:staged.size,restored,verified:staged.size}));
async function hashFile(file){
 const {createReadStream}=await import('node:fs');
 const h=createHash('sha256');let size=0;
 for await(const b of createReadStream(file)){h.update(b);size+=b.length}
 return {size,sha256:h.digest('hex')};
}
