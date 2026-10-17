import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPdfExtractionCoverage} from '../api/customer-pdf-extract.js';
test('LAW-011 checks exact page coverage without a fixed page limit',()=>{
 const totalPages=1200,startPage=1001,endPage=1200;
 const pages=Array.from({length:200},(_,i)=>({page:startPage+i,text:''}));
 assert.equal(assertPdfExtractionCoverage({pages,totalPages,startPage,endPage}),true);
 assert.throws(()=>assertPdfExtractionCoverage({pages:pages.slice(1),totalPages,startPage,endPage}),/COVERAGE_MISMATCH/);
 assert.throws(()=>assertPdfExtractionCoverage({pages:pages.map((p,i)=>i===20?{...p,page:p.page+1}:p),totalPages,startPage,endPage}),/SEQUENCE_MISMATCH/);
});
