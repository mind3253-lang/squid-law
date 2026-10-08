// Run: node --experimental-default-type=module --test tests/analysis-evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalIndex,buildEvidenceMap} from '../analysis-local.js';
import {buildVerifiedComparisonReport} from '../analysis-comparison-report.js';
import {verifyCitation} from '../source-verification.js';

const docs=[
 {name:'원고.pdf',pages:[{text:'원고는 갑 제1호증의 2 계약서를 제출하였다. 2023.11.07. 임대차계약을 체결하였다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 갑제1호증의2 문서에 기재된 계약기간을 다투고 있다.'}]}
];

test('standard exhibit labels and subnumbers are indexed',()=>{
 const index=buildLocalIndex(docs);
 assert.ok(index.references[0].refs.includes('갑 제1호증의 2'));
 assert.ok(index.references[1].refs.includes('갑제1호증의2'));
 assert.equal(buildEvidenceMap(index).filter(x=>x.documentCount===2).length,1);
});

test('shared exhibit number produces source-verified comparison, not contradiction',()=>{
 const report=buildVerifiedComparisonReport(docs);
 assert.equal(report.kind,'reference-co-mentions-not-contradictions');
 assert.equal(report.diagnostics.sourceMatched,1);
 assert.equal(report.diagnostics.needsReview,0);
 assert.equal(report.leads[0].sourceReady,true);
});

test('wrong page, missing quote, and unreadable pages never verify',()=>{
 assert.equal(verifyCitation(docs,{document:'원고.pdf',page:2,quote:'2023.11.07. 임대차계약'}).status,'invalid_page');
 assert.equal(verifyCitation(docs,{document:'원고.pdf',page:1,quote:'존재하지 않는 증거 문장입니다'}).status,'unmatched');
 assert.equal(verifyCitation([{name:'scan.pdf',pages:[{text:''}]}],{document:'scan.pdf',page:1,quote:'원문에서 확인할 수 없는 내용'}).status,'unreadable_page');
});

test('ambiguous duplicate filenames are rejected for source verification',()=>{
 assert.equal(verifyCitation([docs[0],docs[0]],{document:'원고.pdf',page:1,quote:'2023.11.07. 임대차계약'}).status,'ambiguous_document');
});

test('evidence label with 소 prefix is recognized',()=>{
 const index=buildLocalIndex([{name:'old.pdf',pages:[{text:'소갑 제3호증의 1 계약서가 제출되었습니다.'}]}]);
 assert.ok(index.references[0].refs.includes('소갑 제3호증의 1'));
});
