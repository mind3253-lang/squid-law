import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisionWindowPages} from '../lib/vision-page-validation.mjs';
const page=n=>({page:n,visualFacts:[],observedText:'',uncertainties:[]});
test('maps valid local pages to absolute source indexes',()=>{
 const v=validateVisionWindowPages({pageObservations:[page('1'),page(2)],unreviewedPages:['3']},{pageOffset:20,windowPageCount:3});
 assert.deepEqual(v.pageObservations.map(p=>p.page),[21,22]);assert.deepEqual(v.unreviewedPages,[23]);
});
test('rejects missing, out-of-window and overlapping pages',()=>{
 assert.throws(()=>validateVisionWindowPages({pageObservations:[page(1)],unreviewedPages:[]},{windowPageCount:2}),/INCOMPLETE_PAGE_COVERAGE/);
 assert.throws(()=>validateVisionWindowPages({pageObservations:[page(3)],unreviewedPages:[]},{windowPageCount:2}),/INVALID_PAGE/);
 assert.throws(()=>validateVisionWindowPages({pageObservations:[page(1)],unreviewedPages:[1]}),/CONFLICTING_PAGE_STATUS/);
});
test('never repairs invalid or fractional provider indexes',()=>{
 for(const n of ['page 1','1.0',0,-1,1.5,null])assert.throws(()=>validateVisionWindowPages({pageObservations:[page(n)],unreviewedPages:[]}),/INVALID_PAGE/);
});
