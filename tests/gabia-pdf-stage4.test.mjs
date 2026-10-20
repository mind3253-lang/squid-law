import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveGabiaPdf,readGabiaPdf,gabiaDocumentLocation} from '../server/gabia-immutable-pdf.mjs';
import {reconcilePdfManifests} from '../server/gabia-pdf-reconcile.mjs';
const customerKey='a'.repeat(64),caseId='11111111-1111-4111-8111-111111111111';
test('archive is immutable, owner scoped and checksum checked',async()=>{
 const root=await mkdtemp(join(tmpdir(),'gabia-pdf-test-'));
 try{
  const bytes=Buffer.from('%PDF-1.7\nfixture');
  const doc=await archiveGabiaPdf({root,customerKey,caseId,bytes});
  assert.deepEqual(await readGabiaPdf({root,customerKey,caseId,documentId:doc.documentId,expectedSha256:doc.sha256}),bytes);
  await assert.rejects(readGabiaPdf({root,customerKey:'b'.repeat(64),caseId,documentId:doc.documentId,expectedSha256:doc.sha256}));
  assert.throws(()=>gabiaDocumentLocation({root,customerKey:'../',caseId,documentId:doc.documentId}));
 }finally{await rm(root,{recursive:true,force:true})}
});
test('manifest reconciliation rejects missing or changed PDF',()=>{
 const x={customerKey,caseId,documentId:'22222222-2222-4222-8222-222222222222',sha256:'b'.repeat(64),bytes:120,pageCount:8};
 assert.equal(reconcilePdfManifests([x],[x]).ok,true);
 assert.deepEqual(reconcilePdfManifests([x],[{...x,pageCount:7}]).mismatch,[customerKey+':'+caseId+':'+x.documentId]);
});
