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
