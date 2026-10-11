import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {planVisualEvidence,validateVisualResult,buildVisionRequest,estimateVisionBudget} from '../lib/visual-evidence.mjs';
const hash='a'.repeat(64);
test('mixed OCR and image pages require distinct source-bound verification',()=>{
 const plan=planVisualEvidence({documentId:'doc',pages:[{page:20,text:'계약서'},{page:21,text:''}],images:[{page:20,index:1,kind:'signature',sha256:hash}],inventoryComplete:true});
 assert.equal(plan.pages[0].requiresVisualReview,true);
 assert.equal(plan.pages[1].requiresOCR,true);
 const good={documentId:'doc',independentVisualVerified:true,pages:[{page:20,textHash:plan.pages[0].textHash,images:[{index:1,sha256:hash,status:'verified'}]},{page:21,textHash:plan.pages[1].textHash,images:[],ocrText:'서명 확인',ocrStatus:'verified'}]};
 assert.equal(validateVisualResult(plan,good).complete,true);
 assert.equal(validateVisualResult({...plan,inventoryComplete:false},good).complete,false);
 assert.equal(validateVisualResult(plan,{...good,independentVisualVerified:false}).complete,false);
 assert.equal(validateVisualResult(plan,{...good,pages:good.pages.slice(0,1)}).complete,false);
 assert.equal(validateVisualResult(plan,{...good,pages:[{...good.pages[0],images:[{index:1,sha256:'b'.repeat(64),status:'verified'}]},good.pages[1]]}).complete,false);
 assert.equal(validateVisualResult(plan,{...good,pages:[good.pages[0],{...good.pages[1],ocrStatus:'pending'}]}).complete,false);
});
test('duplicate visual objects and fabricated source pages are rejected',()=>{
 assert.throws(()=>planVisualEvidence({documentId:'doc',pages:[{page:1,text:''}],images:[{page:2,index:1,sha256:hash}]}));
 assert.throws(()=>planVisualEvidence({documentId:'doc',pages:[{page:1,text:''}],images:[{page:1,index:1,sha256:hash},{page:1,index:1,sha256:hash}]}));
});
test('vision adapter builds request without executing paid service',()=>{
 const request=buildVisionRequest({documentId:'doc',page:5,imageSha256:hash,mime:'image/png',dataUrl:'data:image/png;base64,YQ==',model:'configured-model'});
 assert.equal(request.input[0].content[1].type,'input_image');
 assert.equal(request.metadata.sourcePage,'5');
 assert.equal(estimateVisionBudget({imageCount:829,estimatedInputTokensPerImage:2000,estimatedOutputTokensPerImage:500,inputUsdPerMillion:1,outputUsdPerMillion:4}).estimatedImages,829);
});

test('duplicate verification rows cannot masquerade as full visual coverage',()=>{
 const plan=planVisualEvidence({documentId:'doc',pages:[{page:1,text:'A'},{page:2,text:'B'}],images:[{page:1,index:1,sha256:hash}],inventoryComplete:true});
 const one={page:1,textHash:plan.pages[0].textHash,images:[{index:1,sha256:hash,status:'verified'}]};
 const two={page:2,textHash:plan.pages[1].textHash,images:[]};
 const base={documentId:'doc',independentVisualVerified:true,pages:[one,two]};
 assert.equal(validateVisualResult(plan,base).complete,true);
 assert.equal(validateVisualResult(plan,{...base,pages:[one,one]}).complete,false);
 assert.equal(validateVisualResult(plan,{...base,pages:[{...one,images:[one.images[0],one.images[0]]},two]}).complete,false);
});

test('source visual plan duplicate pages rejected',()=>{
 const p=planVisualEvidence({documentId:'doc',pages:[{page:1,text:'A'},{page:2,text:'B'}],inventoryComplete:true});
 const r={documentId:'doc',independentVisualVerified:true,pages:p.pages.map(x=>({page:x.page,textHash:x.textHash,images:[]}))};
 assert.equal(validateVisualResult({...p,pages:[p.pages[0],p.pages[0]]},r).complete,false);
});

test('visual audit rejects malformed source image identifiers',()=>{
 const p=planVisualEvidence({documentId:'d',pages:[{page:1,text:'A'}],images:[{page:1,index:1,sha256:hash}],inventoryComplete:true});
 const r={documentId:'d',independentVisualVerified:true,pages:[{page:1,textHash:p.pages[0].textHash,images:[{index:1,sha256:hash,status:'verified'}]}]};
 assert.equal(validateVisualResult(p,r).complete,true);
 assert.equal(validateVisualResult({...p,pages:[{...p.pages[0],images:[p.pages[0].images[0],p.pages[0].images[0]]}]},r).complete,false);
});

test('visual plan source digest and document identity cannot be forged',()=>{
 const p=planVisualEvidence({documentId:'d',pages:[{page:1,text:'A'}],inventoryComplete:true});
 const r={documentId:'d',independentVisualVerified:true,pages:[{page:1,textHash:p.pages[0].textHash,images:[]}]};
 assert.equal(validateVisualResult(p,r).complete,true);
 assert.equal(validateVisualResult({...p,pages:[{...p.pages[0],documentId:'other'}]},r).complete,false);
});

test('PDF image paint operations are inventoried without claiming image verification',async()=>{
 const {countImagePaintOperations}=await import('../api/customer-pdf-extract.js');
 const {OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 assert.equal(countImagePaintOperations({fnArray:[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.beginText]}),2);
 const plan=planVisualEvidence({documentId:'d',pages:[{page:1,text:'텍스트',imageOperatorCount:2}]});
 assert.equal(plan.pages[0].imageOperatorCount,2);
 assert.equal(plan.pages[0].requiresVisualReview,true);
 assert.equal(plan.inventoryComplete,false);
});

test('PDF page range checkpoints cover final page of 10001-page corpus',async()=>{
 const {resolvePdfPageRange}=await import('../api/customer-pdf-extract.js');
 assert.deepEqual(resolvePdfPageRange(10001,{startPage:10001,pageCount:20}),{startPage:10001,endPage:10001});
 assert.deepEqual(resolvePdfPageRange(338,{startPage:321,pageCount:20}),{startPage:321,endPage:338});
 assert.throws(()=>resolvePdfPageRange(10001,{startPage:10002,pageCount:20}),/INVALID_PDF_PAGE_RANGE/);
});

test('visual plan refuses tampered image operator count',async()=>{
 const {createHash}=await import('node:crypto');
 const visualOperatorDigest=createHash('sha256').update(JSON.stringify([1,2,'operator_scan_unverified'])).digest('hex');
 const plan=planVisualEvidence({documentId:'d',pages:[{page:1,text:'본문',imageOperatorCount:2,visualInventoryStatus:'operator_scan_unverified',visualOperatorDigest}],images:[{page:1,index:1,sha256:hash}],inventoryComplete:true});
 const result={documentId:'d',independentVisualVerified:true,pages:[{page:1,textHash:plan.pages[0].textHash,images:[{index:1,sha256:hash,status:'verified'}]}]};
 assert.equal(validateVisualResult(plan,result).complete,true);
 assert.equal(validateVisualResult({...plan,pages:[{...plan.pages[0],imageOperatorCount:3}]},result).complete,false);
});

test('PDF range extraction preserves absolute page numbers on a real three-page PDF',async()=>{
 const {extractPdfPages}=await import('../api/customer-pdf-extract.js');
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>',
  null,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
  null,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
  null,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
 ];
 for(const [index,label] of [[3,'First'],[5,'Second'],[7,'Third']]){
  const stream='BT /F1 12 Tf 72 720 Td ('+label+') Tj ET';
  objects[index]='<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream';
 }
 let pdf='%PDF-1.4\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n'}
 const xref=Buffer.byteLength(pdf);pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 const result=await extractPdfPages(Buffer.from(pdf),{startPage:2,pageCount:1});
 assert.equal(result.totalPages,3);
 assert.deepEqual(result.pages.map(x=>x.page),[2]);
 assert.match(result.pages[0].text,/Second/);
 assert.equal(result.finished,false);
});

test('visual work queue separates OCR, image inventory and paid provider execution',async()=>{
 const {buildVisualWorkQueue}=await import('../lib/visual-evidence.mjs');
 const queue=buildVisualWorkQueue({documentId:'doc',sourcePdfPath:'private/doc.pdf',pages:[{page:1,text:'본문',imageOperatorCount:0},{page:2,text:'',imageOperatorCount:1},{page:3,text:'본문',imageOperatorCount:2}]});
 assert.equal(queue.taskCount,2);
 assert.deepEqual(queue.tasks.map(t=>t.page),[2,3]);
 assert.equal(queue.tasks[0].needsOCR,true);
 assert.equal(queue.tasks[1].needsOCR,false);
 assert.equal(queue.verified,false);
 assert.ok(queue.tasks.every(t=>t.status==='awaiting_visual_provider'));
});

test('large PDF extraction windows preserve exact page coverage',async()=>{
 const {choosePdfExtractionWindow,resolvePdfPageRange}=await import('../api/customer-pdf-extract.js');
 for(const [bytes,window] of [[5*1024*1024,100],[30*1024*1024,40],[80*1024*1024,20]]){
  assert.equal(choosePdfExtractionWindow(bytes),window);
  for(const pageCount of [338,1000,10001]){
   const covered=[];
   for(let start=1;start<=pageCount;start+=window){
    const range=resolvePdfPageRange(pageCount,{startPage:start,pageCount:window});
    for(let page=range.startPage;page<=range.endPage;page++)covered.push(page);
   }
   assert.equal(covered.length,pageCount);
   assert.equal(new Set(covered).size,pageCount);
   assert.equal(covered.at(-1),pageCount);
  }
 }
});
