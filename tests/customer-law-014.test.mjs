import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reconcileVisualOcr} from '../lib/ocr-visual-recovery.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const sourcePdfSha256='a'.repeat(64);
const pages=[{page:1,text:'',imageOperatorCount:2},{page:2,text:'기존 원문',textSha256:sha('기존 원문'),imageOperatorCount:0}];
const observations={pageObservations:[{page:1,observedText:'복원 글자',uncertainties:[]},{page:2,observedText:'',uncertainties:[]}]};
const primary={sourcePdfSha256,observations};
const independent={sourcePdfSha256,auditPass:true,observations};
test('LAW-014 OCR restores verified text and preserves existing source text',()=>{
 const result=reconcileVisualOcr({pages,primary,independent,sourcePdfSha256});
 assert.equal(result.pages[0].text,'복원 글자');
 assert.equal(result.pages[0].textSha256,sha('복원 글자'));
 assert.equal(result.pages[1].text,'기존 원문');
});
test('LAW-014 OCR rejects incomplete visual coverage and altered original text',()=>{
 assert.throws(()=>reconcileVisualOcr({pages,primary,independent:{...independent,observations:{pageObservations:[observations.pageObservations[0]]}},sourcePdfSha256}),/COVERAGE_MISMATCH/);
 assert.throws(()=>reconcileVisualOcr({pages:[pages[0],{...pages[1],text:'변조'}],primary,independent,sourcePdfSha256}),/ORIGINAL_TEXT_DIGEST_MISMATCH/);
});
