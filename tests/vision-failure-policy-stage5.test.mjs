import test from 'node:test';
import assert from 'node:assert/strict';
import {visionFailureDisposition,visionFailureDiagnostic} from '../lib/vision-failure-policy.mjs';
test('invalid provider page blocks without automatic re-billing',()=>{
 assert.deepEqual(visionFailureDisposition('VISION_PDF_INVALID_PAGE',{attempts:0,maxAttempts:3}),{status:'blocked',retryable:false});
});
test('transient provider errors retry within bounded attempts',()=>{
 assert.deepEqual(visionFailureDisposition('VISION_PDF_API_503',{attempts:0,maxAttempts:3}),{status:'retry',retryable:true});
 assert.deepEqual(visionFailureDisposition('VISION_PDF_API_503',{attempts:2,maxAttempts:3}),{status:'failed',retryable:false});
 for(const code of ['VISION_PDF_API_429','VISION_PDF_UPLOAD_429','GPT_LEGAL_HTTP_429','GPT_LEGAL_HTTP_503','DELTA_GPT_HTTP_429'])
  assert.deepEqual(visionFailureDisposition(code,{attempts:0,maxAttempts:3}),{status:'retry',retryable:true});
 for(const code of ['GPT_LEGAL_HTTP_400','GPT_LEGAL_SOURCE_AUDIT_FAILED','VISION_PDF_INVALID_JSON'])
  assert.deepEqual(visionFailureDisposition(code,{attempts:0,maxAttempts:3}),{status:'failed',retryable:false});
});
test('diagnostics capture exact provider page and response id',()=>{
 const d=visionFailureDiagnostic({reason:'page_number_out_of_window',index:2,pageOffset:12,windowPageCount:8,providerPage:19,providerResponseId:'resp_test'});
 assert.equal(d.providerPage,'19');
 assert.equal(d.providerResponseId,'resp_test');
 assert.equal(d.pageOffset,12);
});
