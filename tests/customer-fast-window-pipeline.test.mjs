import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {createHash} from 'node:crypto';
import {splitPdfVisualWindows,splitPdfVisualPageSet,mergeVisualWindows} from '../lib/pdf-visual-windows.mjs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('multiple 12-page visual windows preserve every source page and immutable digest',async()=>{
 const src=await PDFDocument.create(),font=await src.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=41;i++){const page=src.addPage([250,350]);page.drawText('EVIDENCE_'+i,{x:10,y:300,size:11,font})}
 const original=Buffer.from(await src.save()),hash=createHash('sha256').update(original).digest('hex');
 const starts=[1,13,25,37],groups=[
  ...(await splitPdfVisualWindows({pdfBytes:original,startPage:1,count:3,pageCount:12})),
  ...(await splitPdfVisualWindows({pdfBytes:original,startPage:37,count:3,pageCount:12}))
 ];
 assert.deepEqual(groups.map(x=>x.startPage),starts);
 assert.deepEqual(groups.map(x=>x.endPage),[12,24,36,41]);
 assert.ok(groups.every(x=>x.originalSha256===hash));
 let count=0;const windows=[];
 for(const group of groups){
  const pdf=await PDFDocument.load(group.bytes);
  assert.equal(pdf.getPageCount(),group.endPage-group.startPage+1);
  const observations=Array.from({length:pdf.getPageCount()},(_,i)=>({
   page:group.startPage+i,visualFacts:['reviewed'],observedText:'TEXT',uncertainties:[]
  }));
  windows.push({documentId:'doc1',sourcePdfSha256:hash,
   observations:{pageObservations:observations,unreviewedPages:[]}});
  count+=observations.length;
 }
 assert.equal(count,41);
 const merged=mergeVisualWindows({documentId:'doc1',sourcePdfSha256:hash,pageCount:41,windows});
 assert.equal(merged.observations.pageObservations.length,41);
 assert.deepEqual(merged.observations.pageObservations.map(x=>x.page),Array.from({length:41},(_,i)=>i+1));
});
test('OCR sparse-page split never reads wrong original pages or skips out-of-range checks',async()=>{
 const src=await PDFDocument.create();
 for(let i=1;i<=22;i++)src.addPage([250,350]);
 const original=Buffer.from(await src.save()),hash=createHash('sha256').update(original).digest('hex');
 const sparse=await splitPdfVisualPageSet({pdfBytes:original,pages:[1,8,22]});
 assert.deepEqual(sparse.map(x=>x.startPage),[1,8,22]);
 assert.ok(sparse.every(x=>x.originalSha256===hash&&x.startPage===x.endPage));
 for(const part of sparse)assert.equal((await PDFDocument.load(part.bytes)).getPageCount(),1);
 await assert.rejects(()=>splitPdfVisualPageSet({pdfBytes:original,pages:[1,1]}),/INVALID_OCR_PAGE_SET/);
 await assert.rejects(()=>splitPdfVisualPageSet({pdfBytes:original,pages:[30]}),/OCR_PAGE_OUT_OF_RANGE/);
});
test('visual review has fenced, checkpointed parallel independent primary and audit passes',()=>{
 const worker=source('api/customer-analysis-worker.js');
 const jobs=source('api/customer-analysis-jobs-db.js');
 assert.match(worker,/export const maxDuration=300/);
 assert.match(worker,/const VISUAL_WINDOW_CONCURRENCY=3/);
 assert.match(worker,/splitPdfVisualWindows\(\{pdfBytes:bytes,startPage/);
 assert.match(worker,/splitPdfVisualPageSet\(\{pdfBytes:source/);
 assert.match(worker,/Promise\.allSettled\(starts\.map\(async\(page,i\)=>/);
 assert.match(worker,/Promise\.allSettled\(selected\.map\(async\(page,i\)=>/);
 assert.match(worker,/if\(failed\)throw failed.reason/);
 assert.match(worker,/OCR_CACHE_SOURCE_MISMATCH/);
 assert.match(worker,/OCR_INDEPENDENT_SOURCE_MISMATCH/);
 assert.match(worker,/compareIndependentVisualPass/);
 assert.match(worker,/SEMANTIC_UNKNOWN_SOURCE_REFERENCE/);
 assert.match(worker,/buildSemanticReviewRequest/);
 assert.match(jobs,/interval '250 milliseconds'/);
 assert.match(jobs,/delayMs:600/);
 assert.match(jobs,/FOR UPDATE SKIP LOCKED/);
 assert.match(jobs,/AND owner_token=\$4 AND fence=\$5 AND lease_expires_at>now\(\)/);
});


test('legal model window reuses only immutable SHA-verified original source bundles',()=>{
 const worker=source('api/customer-analysis-worker.js');
 assert.match(worker,/legal-source-text-bundle\.json/);
 assert.match(worker,/bundle\.sourceIndexSha256!==request\.sourceIndexSha256/);
 assert.match(worker,/createHash\('sha256'\)\.update\(u\.text\)\.digest\('hex'\)!==u\.hash/);
 assert.match(worker,/maxCharacters:64000/);
 assert.match(worker,/!extracted\?\.pages\|\|extracted\.documentId!==d\.id/);
 assert.match(worker,/LEGAL_SOURCE_REHYDRATION_MISMATCH/);
});
test('transient job failures restart after bounded SQL backoff, not on a five-minute stall',()=>{
 const jobs=source('api/customer-analysis-jobs-db.js');
 assert.match(jobs,/stage==='error'&&Number\(job\.attempts\|\|0\)<4/);
 assert.match(jobs,/2\*\*Math\.min\(3,Number\(job\.attempts\|\|0\)\)\*1000\+750/);
 assert.match(jobs,/LEAST\(3600,POWER\(2,LEAST\(attempts,10\)\)\)/);
 assert.match(jobs,/interval '250 milliseconds'/);
});
