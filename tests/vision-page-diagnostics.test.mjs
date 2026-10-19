import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisionWindowPages} from '../lib/vision-page-validation.mjs';
test('missing local page is identified',()=>{
 assert.throws(()=>validateVisionWindowPages({pageObservations:[{page:1,visualFacts:[],observedText:'',uncertainties:[]}],unreviewedPages:[]},{windowPageCount:2}),e=>e.message==='VISION_PDF_INCOMPLETE_PAGE_COVERAGE'&&e.missingLocalPages?.[0]===2);
});
