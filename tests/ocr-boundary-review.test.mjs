import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reconcileVisualOcr} from '../lib/ocr-visual-recovery.mjs';
import {auditBoundaryReview,compareBoundaryReviews} from '../lib/independent-boundary-review.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const sourcePdfSha256=sha('pdf');
const observation={page:1,observedText:'스캔 문서',visualFacts:[],uncertainties:[]};
test('OCR accepts matching independent original-page transcription',()=>{
 const pages=[{page:1,text:'',textSha256:sha(''),imageOperatorCount:1}];
 const primary={sourcePdfSha256,observations:{pageObservations:[observation]}};
 const independent={...primary,auditPass:true};
 const result=reconcileVisualOcr({pages,primary,independent,sourcePdfSha256});
 assert.equal(result.pages[0].text,'스캔 문서');
 assert.equal(result.pages[0].textSha256,sha('스캔 문서'));
});
test('OCR rejects independent disagreement',()=>{
 const pages=[{page:1,text:'',textSha256:sha(''),imageOperatorCount:1}];
 const primary={sourcePdfSha256,observations:{pageObservations:[observation]}};
 const independent={sourcePdfSha256,auditPass:true,observations:{pageObservations:[{...observation,observedText:'다른 내용'}]}};
 assert.throws(()=>reconcileVisualOcr({pages,primary,independent,sourcePdfSha256}),/OCR_INDEPENDENT_TEXT_MISMATCH/);
});
test('boundary audit requires contiguous page coverage',()=>{
 const result={documentId:'doc',sourcePdfSha256,sections:[{kind:'소장',startPage:1,endPage:1,evidencePage:1,reason:'표제'}],unreviewedPages:[]};
 assert.equal(auditBoundaryReview({result,documentId:'doc',sourcePdfSha256,pageCount:2}).complete,false);
});
test('independent boundary disagreement blocks completion',()=>{
 const primary={documentId:'doc',sourcePdfSha256,sections:[{kind:'소장',startPage:1,endPage:2,evidencePage:1,reason:'표제'}],unreviewedPages:[]};
 const independent={...primary,sections:[{...primary.sections[0],kind:'답변서'}]};
 assert.equal(compareBoundaryReviews({primary,independent,documentId:'doc',sourcePdfSha256,pageCount:2}).complete,false);
});
