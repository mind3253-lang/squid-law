import assert from 'node:assert/strict';
import {buildCrossDocumentLeads} from '../analysis-cross-document.js';
import {createComparisonModelRequest} from '../analysis-comparison-prompt.js';
import {validateComparisonResponse} from '../analysis-comparison-response.js';
const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증에 따라 계약기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증에 따라 계약기간 2년을 주장한다.'}]}
];
const lead=buildCrossDocumentLeads(documents).leads[0];
assert.ok(lead);
const prompt=createComparisonModelRequest(lead);
assert.match(prompt.system,/모순이나 허위라고 단정하지 마세요/);
assert.match(prompt.user,/소갑 제3호증/);
const response={relation:'different_positions',explanation:'서로 다른 계약기간을 주장하고 있어 추가 검토가 필요하다.',citations:lead.sources};
const checked=validateComparisonResponse(documents,lead,response);
assert.equal(checked.sourceReady,true);
assert.equal(checked.interpretationStatus,'AI 해석 후보 · 사람의 판단 필요');
assert.deepEqual(checked.citations.map(c=>c.verification.status),['matched','matched']);
assert.throws(()=>validateComparisonResponse(documents,lead,{...response,relation:'proven_fraud'}),/INVALID_COMPARISON_RESPONSE/);
assert.throws(()=>validateComparisonResponse(documents,lead,{...response,citations:[{...lead.sources[0],quote:'원문에 없는 가짜 인용'},lead.sources[1]]}),/COMPARISON_CITATION_CHANGED/);
assert.throws(()=>createComparisonModelRequest({...lead,sources:[lead.sources[0],lead.sources[0]]}),/COMPARISON_REQUIRES_TWO_DOCUMENTS/);
console.log('PASS: semantic comparison prompts retain both sources and reject unsupported labels and changed quotes');
