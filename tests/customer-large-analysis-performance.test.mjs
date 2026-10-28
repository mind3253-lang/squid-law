import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {splitPdfVisualWindows,splitPdfVisualPageSet,mergeVisualWindows} from '../lib/pdf-visual-windows.mjs';
import {sourceVisionWindowCachePath,sourceBoundaryCachePath,visionSourceReceipt,reuseVisionReceipt,
 boundarySourceReceipt,reuseBoundaryReceipt} from '../lib/customer-source-reuse.mjs';
import {timedAnalysisStep} from '../lib/analysis-timing.mjs';

const doc={id:'fixed-pdf',sha256:'a'.repeat(64),pageCount:50};
const prefix='squidlaw/cases/customer1/case1/';
const model='gpt-6-astra';
const output=(d,start,count)=>({documentId:d.id,sourcePdfSha256:d.sha256,
 startPage:start,endPage:start+count-1,providerResponseId:'old-provider-id',
 modelUsage:{model,stage:'vision_pdf_primary',inputTokens:120,outputTokens:80,totalTokens:200},
 observations:{pageObservations:Array.from({length:count},(_,i)=>({
  page:start+i,visualFacts:[],observedText:'visible text',uncertainties:[]
 })),unreviewedPages:[]}});

test('only an immutable, completely checked visual window can be reused',()=>{
 const d={...doc,pageCount:8};
 const receipt=visionSourceReceipt({doc:d,startPage:1,model,output:output(d,1,8)});
 assert.ok(receipt);
 const cached=reuseVisionReceipt({cache:receipt,doc:d,startPage:1,model});
 assert.equal(cached.observations.pageObservations.length,8);
 assert.deepEqual([cached.startPage,cached.endPage],[1,8]);
 assert.equal(cached.modelUsage.totalTokens,0);
 assert.equal(cached.providerResponseId,null);
 assert.equal(cached.sourceProviderResponseId,'old-provider-id');
 assert.equal(cached.reusedFromVerifiedSource,true);
 assert.match(sourceVisionWindowCachePath({prefix,doc:d,startPage:1,model}),/source-vision-cache/);
 assert.equal(reuseVisionReceipt({cache:receipt,doc:{...d,sha256:'b'.repeat(64)},startPage:1,model}),null);
 assert.equal(reuseVisionReceipt({cache:receipt,doc:d,startPage:1,model:'different'}),null);
 const tampered=structuredClone(receipt);tampered.output.observations.pageObservations[0].observedText='tampered';
 assert.equal(reuseVisionReceipt({cache:tampered,doc:d,startPage:1,model}),null);
 const missing=output(d,1,8);missing.observations.pageObservations.pop();
 assert.equal(visionSourceReceipt({doc:d,startPage:1,model,output:missing}),null);
});

test('boundary reuse preserves full-page source identity and never double counts usage',()=>{
 const result={documentId:doc.id,sourcePdfSha256:doc.sha256,
  sections:[{kind:'소장',startPage:1,endPage:50,evidencePage:1,reason:'source evidence'}],
  unreviewedPages:[],providerResponseId:'boundary-old'};
 const receipt=boundarySourceReceipt({doc,model,result});
 assert.ok(receipt);
 const reused=reuseBoundaryReceipt({cache:receipt,doc,model});
 assert.equal(reused.modelUsage.totalTokens,0);
 assert.equal(reused.providerResponseId,null);
 assert.equal(reused.sections[0].endPage,50);
 assert.match(sourceBoundaryCachePath({prefix,doc,model}),/source-boundary-cache/);
 assert.equal(reuseBoundaryReceipt({cache:receipt,doc:{...doc,pageCount:49},model}),null);
 assert.equal(boundarySourceReceipt({doc,model,result:{...result,sections:[{...result.sections[0],endPage:49}]}}),null);
});

test('five 10-page PDF windows retain all original page numbers',async()=>{
 const source=await PDFDocument.create();
 for(let i=0;i<50;i++)source.addPage([120,120]);
 const bytes=Buffer.from(await source.save());
 const pieces=await splitPdfVisualWindows({pdfBytes:bytes,startPage:1,count:5,pageCount:10});
 assert.equal(pieces.length,5);
 assert.deepEqual(pieces.map(x=>[x.startPage,x.endPage]),[[1,10],[11,20],[21,30],[31,40],[41,50]]);
 const windows=pieces.map(piece=>({
  documentId:doc.id,sourcePdfSha256:doc.sha256,startPage:piece.startPage,endPage:piece.endPage,
  observations:output(doc,piece.startPage,10).observations}));
 const merged=mergeVisualWindows({documentId:doc.id,sourcePdfSha256:doc.sha256,pageCount:50,windows});
 assert.equal(merged.observations.pageObservations.length,50);
 assert.equal(merged.observations.pageObservations[49].page,50);
 const singles=await splitPdfVisualPageSet({pdfBytes:bytes,pages:[1,11,21,31,41]});
 assert.deepEqual(singles.map(x=>x.startPage),[1,11,21,31,41]);
});

test('live worker preserves ten-page PDF windows and auditable source-reuse receipts',()=>{
 const s=readFileSync(new URL('../api/customer-analysis-worker.js',import.meta.url),'utf8');
 assert.match(s,/VISUAL_WINDOW_CONCURRENCY/);
 assert.match(s,/completeWindows\.map\(\(w,i\)=>\(\{/);
 assert.match(s,/startPage:windowStarts\[i\]/);
 assert.match(s,/endPage:Math\.min\(doc\.pageCount,windowStarts\[i\]\+9\)/);
 assert.match(s,/sourceVisionWindowCachePath/);
 assert.match(s,/sourceBoundaryCachePath/);
 assert.match(s,/reusedFromVerifiedSource/);
 const range=readFileSync(new URL('../lib/customer-pdf-visual-range.mjs',import.meta.url),'utf8');
 assert.match(range,/pageGroups\.length>5/);
 assert.match(range,/count>5/);
 assert.match(range,/pages\.length>5/);
});

test('privacy-safe timers support the boundary and provider-network stages',async()=>{
 const events=[];
 for(const stage of ['boundary_review','vision_upload','vision_response','vision_cleanup']){
  const result=await timedAnalysisStep(stage,async()=>stage,{enabled:true,sink:x=>events.push(x)});
  assert.equal(result,stage);
 }
 assert.equal(events.length,4);
 assert.ok(events.every(x=>x.startsWith('ANALYSIS_TIMING ')));
});
