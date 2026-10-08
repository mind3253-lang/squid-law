import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrivatePilotResult} from '../private-pilot-validation.js';
const docs=[{name:'contract.pdf',pages:[{text:'갑 제1호증 계약서는 2023년 11월 7일에 체결되었다.'}]}];
const payload=()=>({schema:'squidlaw-private-pilot-v1',kind:'source-matched-review-candidates-not-legal-conclusions',documents:[{name:'contract.pdf',pages:1}],findings:[{title:'계약서 언급',citations:[{document:'contract.pdf',page:1,quote:'갑 제1호증 계약서는 2023년 11월 7일에 체결되었다.'}]}]});
test('valid model output is reverified against current PDF',()=>{
 const result=validatePrivatePilotResult(docs,payload());
 assert.equal(result.checked.length,1);
 assert.equal(result.summary.verifiedFindings,1);
});
test('fabricated quote is blocked',()=>{
 const bad=payload();bad.findings[0].citations[0].quote='원문에 존재하지 않는 계약 체결 사실';
 assert.throws(()=>validatePrivatePilotResult(docs,bad),/UNVERIFIED_PRIVATE_PILOT_CITATION/);
});
test('missing citations are blocked',()=>{
 const bad=payload();bad.findings[0].citations=[];
 assert.throws(()=>validatePrivatePilotResult(docs,bad),/INVALID_PRIVATE_PILOT_FINDINGS/);
});
test('duplicate source filenames are blocked',()=>{
 assert.throws(()=>validatePrivatePilotResult([...docs,...docs],payload()),/AMBIGUOUS_SOURCE_DOCUMENTS/);
});
test('duplicate filenames in model manifest are blocked',()=>{
 const bad=payload();bad.documents.push({name:'contract.pdf',pages:1});
 assert.throws(()=>validatePrivatePilotResult(docs,bad),/SOURCE_DOCUMENT_MISMATCH/);
});
test('mismatched page counts are blocked',()=>{
 const bad=payload();bad.documents[0].pages=2;
 assert.throws(()=>validatePrivatePilotResult(docs,bad),/SOURCE_DOCUMENT_MISMATCH/);
});
test('unknown source files are blocked',()=>{
 const bad=payload();bad.findings[0].citations[0].document='missing.pdf';
 assert.throws(()=>validatePrivatePilotResult(docs,bad),/UNVERIFIED_PRIVATE_PILOT_CITATION/);
});
