import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectVisionProviderOutput} from '../lib/vision-provider-triage.mjs';
const observation=page=>({page,visualFacts:[],observedText:'',uncertainties:[]});
test('eight local PDF pages with full coverage pass',()=>{
 const result=inspectVisionProviderOutput({pageObservations:Array.from({length:8},(_,i)=>observation(i+1)),unreviewedPages:[]},{pageOffset:0,windowPageCount:8});
 assert.equal(result.valid,true);
 assert.deepEqual(result.normalized.pageObservations.map(x=>x.page),[1,2,3,4,5,6,7,8]);
});
test('absolute source pages cannot silently replace window-relative pages',()=>{
 const result=inspectVisionProviderOutput({pageObservations:[observation(9)],unreviewedPages:[]},{pageOffset:8,windowPageCount:8});
 assert.equal(result.valid,false);
 assert.equal(result.diagnostic.providerPage,9);
 assert.equal(result.diagnostic.code,'VISION_PDF_INVALID_PAGE');
});
test('unreviewed page is tracked rather than fabricated',()=>{
 const result=inspectVisionProviderOutput({pageObservations:Array.from({length:7},(_,i)=>observation(i+1)),unreviewedPages:[8]},{pageOffset:0,windowPageCount:8});
 assert.equal(result.valid,true);
 assert.deepEqual(result.normalized.unreviewedPages,[8]);
});
