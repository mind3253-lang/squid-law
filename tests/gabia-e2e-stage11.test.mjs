import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGabiaE2E,assessPdfRun} from '../lib/gabia-e2e-gates.mjs';
test('unverified deployment cannot pass end-to-end readiness',()=>{
 const status=assessGabiaE2E({eightPagePdf:true});
 assert.equal(status.passed,false);
 assert.ok(status.missing.includes('largePdfResume'));
});
test('8 page PDF requires actual verified completion',()=>{
 assert.equal(assessPdfRun({status:'blocked',pagesExpected:8,pagesVerified:0}).passed,false);
 assert.equal(assessPdfRun({status:'completed',pagesExpected:8,pagesVerified:8,resultVerified:true,originalSha256Verified:true}).passed,true);
});
