import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {splitPdfVisualWindow,mergeVisualWindows} from '../lib/pdf-visual-windows.mjs';
test('split a 34-page PDF into bounded windows',async()=>{const pdf=await PDFDocument.create();for(let i=0;i<34;i++)pdf.addPage();const original=await pdf.save();const windows=[];for(let page=1;page<=34;page+=12){const window=await splitPdfVisualWindow({pdfBytes:original,startPage:page,pageCount:12});const sliced=await PDFDocument.load(window.bytes);assert.equal(sliced.getPageCount(),Math.min(12,35-page));windows.push({documentId:'d',sourcePdfSha256:window.originalSha256,observations:{pageObservations:Array.from({length:sliced.getPageCount()},(_,i)=>({page:page+i,observedText:'',visualFacts:[],uncertainties:[]})),unreviewedPages:[]}})}const merged=mergeVisualWindows({documentId:'d',sourcePdfSha256:windows[0].sourcePdfSha256,pageCount:34,windows});assert.equal(merged.observations.pageObservations.length,34)});

test('338-page PDF preserves every original page through 29 visual windows',async()=>{
 const pdf=await PDFDocument.create();for(let i=0;i<338;i++)pdf.addPage();
 const original=await pdf.save();const windows=[];
 for(let start=1;start<=338;start+=12){
  const part=await splitPdfVisualWindow({pdfBytes:original,startPage:start,pageCount:12});
  const loaded=await PDFDocument.load(part.bytes);
  const count=Math.min(12,339-start);
  assert.equal(loaded.getPageCount(),count);
  windows.push({documentId:'case338',sourcePdfSha256:part.originalSha256,observations:{pageObservations:Array.from({length:count},(_,i)=>({page:start+i,observedText:'',visualFacts:[],uncertainties:[]})),unreviewedPages:[]}});
 }
 assert.equal(windows.length,29);
 const merged=mergeVisualWindows({documentId:'case338',sourcePdfSha256:windows[0].sourcePdfSha256,pageCount:338,windows});
 assert.deepEqual(merged.observations.pageObservations.map(x=>x.page),Array.from({length:338},(_,i)=>i+1));
});
