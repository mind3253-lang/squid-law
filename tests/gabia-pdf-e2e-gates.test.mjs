// Offline E2E prerequisites; no paid API, production records or worker activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {validateVisionWindowPages} from '../lib/vision-page-validation.mjs';
import {auditVisualProviderCoverage,compareIndependentVisualPass} from '../lib/visual-review-audit.mjs';
test('eight-page source retains exact page count and immutable digest',async()=>{
 const doc=await PDFDocument.create();
 for(let i=0;i<8;i++)doc.addPage([595,842]);
 const bytes=await doc.save();
 const digest=createHash('sha256').update(bytes).digest('hex');
 const reopened=await PDFDocument.load(bytes);
 assert.equal(reopened.getPageCount(),8);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),digest);
});
test('eight-page visual review rejects a missing page',()=>{
 const observation=page=>({page,observedText:'',visualFacts:[],uncertainties:[]});
 const observations=Array.from({length:7},(_,i)=>observation(i+1));
 assert.throws(()=>validateVisionWindowPages({pageObservations:observations,unreviewedPages:[]},{windowPageCount:8}),/VISION_PDF_INCOMPLETE_PAGE_COVERAGE/);
 const valid=validateVisionWindowPages({pageObservations:observations,unreviewedPages:[8]},{windowPageCount:8});
 assert.deepEqual(valid.unreviewedPages,[8]);
});
test('independent pass requires distinct response and matching page evidence',()=>{
 const pageObservations=[{page:1,observedText:'one',visualFacts:[],uncertainties:[]}];
 const base={documentId:'d',sourcePdfSha256:'a'.repeat(64),observations:{pageObservations,unreviewedPages:[]}};
 assert.equal(compareIndependentVisualPass({primary:{...base,providerResponseId:'a'},secondary:{...base,providerResponseId:'a',auditPass:true},pageCount:1}).complete,false);
 assert.equal(compareIndependentVisualPass({primary:{...base,providerResponseId:'a'},secondary:{...base,providerResponseId:'b',auditPass:true},pageCount:1}).complete,true);
});
