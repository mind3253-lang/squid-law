import assert from 'node:assert/strict';
import {buildCrossDocumentLeads} from '../analysis-cross-document.js';
import {verifyCitation} from '../source-verification.js';
const docs=[
 {name:'원고.pdf',pages:[{text:'원고는 소갑 제3호증을 근거로 계약기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 소갑 제3호증에 관한 원고 해석을 다투며 계약기간 2년을 주장한다.'}]},
 {name:'별건.pdf',pages:[{text:'이 문서는 다른 사건의 별도 기록이다.'}]}
];
const out=buildCrossDocumentLeads(docs);
assert.equal(out.schema,'squidlaw-cross-document-leads-v1');
assert.equal(out.leads.length,1);
assert.equal(out.leads[0].sources.length,2);
assert.equal(out.leads[0].reference.replace(/\s/g,''),'소갑제3호증');
for(const source of out.leads[0].sources)assert.equal(verifyCitation(docs,source).status,'matched');
assert.match(out.leads[0].limitation,/모순/);
assert.equal(buildCrossDocumentLeads([{name:'A.pdf',pages:[{text:'소갑 제3호증 언급'}]}]).leads.length,0);
assert.throws(()=>buildCrossDocumentLeads(docs,{maxLeads:0}),/INVALID_COMPARISON_INPUT/);
console.log('PASS: cross-document leads preserve both verified sources without claiming contradiction');
