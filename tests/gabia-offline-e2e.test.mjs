// Offline integration E2E: no network, no database, no Vercel, no paid model calls.
// Run explicitly with: node --test tests/gabia-offline-e2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {archiveGabiaPdf,readGabiaPdf} from '../server/gabia-immutable-pdf.mjs';
import {buildGabiaFirstReport} from '../server/gabia-first-report.mjs';
import {validateCompletionGates} from '../lib/analysis-stage-gates.mjs';
import {LEGAL_TASKS} from '../lib/gpt-legal-expert.mjs';
import {gabiaMarkPreliminarySql} from '../server/gabia-preliminary-status.mjs';
test('Gabia PDF archival -> source extraction -> draft and completion denial',async()=>{
 const root=await mkdtemp(join(tmpdir(),'gabia-offline-e2e-'));
 try{
  const customerKey=createHash('sha256').update('offline-customer').digest('hex');
  const caseId=randomUUID(),pdf=await PDFDocument.create();
  const page=pdf.addPage([595,842]);
  page.drawText('Contract 2026 - evidence text',{x:45,y:790,size:12});
  const bytes=Buffer.from(await pdf.save());
  const archived=await archiveGabiaPdf({root,customerKey,caseId,bytes});
  const restored=await readGabiaPdf({root,customerKey,caseId,documentId:archived.documentId,expectedSha256:archived.sha256});
  assert.deepEqual(restored,bytes);
  const report=await buildGabiaFirstReport({pdfBytes:restored,documentId:archived.documentId});
  assert.equal(report.sourceSha256,archived.sha256);
  assert.equal(report.pageCount,1);
  assert.equal(report.independentlyVerified,false);
  assert.equal(report.readyForCourt,false);
  assert.equal(validateCompletionGates({}).complete,false);
  assert.equal(LEGAL_TASKS.length,6);
  assert.match(gabiaMarkPreliminarySql,/status='blocked'/);
 }finally{await rm(root,{recursive:true,force:true})}
});
