import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {issueCustomerToken,verifyCustomerToken} from '../server/customer-auth.mjs';
import {archiveCustomerPdf,readCustomerPdf} from '../server/customer-pdf-archive.mjs';
test('signed identity rejects forgery and expiry',()=>{
 const secret='s'.repeat(48),now=1700000000000;
 const token=issueCustomerToken({subject:'user-1',secret,now,ttlSeconds:60});
 assert.equal(verifyCustomerToken(token,{secret,now})?.subject,'user-1');
 assert.equal(verifyCustomerToken(token,{secret,now:now+61000}),null);
 assert.equal(verifyCustomerToken(token+'x',{secret,now}),null);
 assert.equal(verifyCustomerToken(token,{secret:'z'.repeat(48),now}),null);
});
test('private PDF archive preserves SHA and customer isolation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'squidlaw-archive-'));
 try{
  const bytes=Buffer.from('%PDF-1.7\nexample');
  const expectedSha256=createHash('sha256').update(bytes).digest('hex');
  const customerKey='a'.repeat(64);
  const saved=await archiveCustomerPdf({root,customerKey,bytes,expectedSha256});
  assert.deepEqual(await readCustomerPdf({root,customerKey,fileId:saved.fileId,expectedSha256}),bytes);
  await assert.rejects(()=>readCustomerPdf({root,customerKey:'b'.repeat(64),fileId:saved.fileId,expectedSha256}));
  await assert.rejects(()=>archiveCustomerPdf({root,customerKey,bytes,expectedSha256:'0'.repeat(64)}),/ARCHIVE_DIGEST_MISMATCH/);
 }finally{await rm(root,{recursive:true,force:true});}
});
