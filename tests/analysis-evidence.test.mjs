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

test('소갑 and 갑 labels match across documents, but 갑 and 을 remain distinct',()=>{
 const source=[
  {name:'one.pdf',pages:[{text:'소갑 제7호증의 1 계약서를 원고가 제출하였습니다.'}]},
  {name:'two.pdf',pages:[{text:'갑제7호증의1 계약서는 다른 내용을 담고 있습니다.'}]},
  {name:'three.pdf',pages:[{text:'을 제7호증의 1 문서는 별도로 제출되었습니다.'}]}
 ];
 const evidence=buildEvidenceMap(buildLocalIndex(source));
 assert.equal(evidence.find(x=>x.reference==='소갑 제7호증의 1').documentCount,2);
 assert.equal(evidence.find(x=>x.reference==='을 제7호증의 1').documentCount,1);
 const report=buildVerifiedComparisonReport(source);
 assert.equal(report.diagnostics.sourceMatched,1);
 assert.equal(report.leads[0].sources.length,2);
});

test('a repeated reference in a single PDF is not a cross-document lead',()=>{
 const source=[{name:'single.pdf',pages:[{text:'갑 제9호증 계약서에 관한 주장입니다.'},{text:'갑 제9호증 문서를 다시 제출하였습니다.'}]}];
 assert.equal(buildVerifiedComparisonReport(source).leads.length,0);
});

test('duplicate filenames cannot produce a seemingly verified comparison',()=>{
 const source=[
  {name:'duplicate.pdf',pages:[{text:'갑 제12호증의 1 계약서를 원고가 제출하였습니다.'}]},
  {name:'duplicate.pdf',pages:[{text:'갑 제12호증의 1 계약서를 피고가 다투었습니다.'}]}
 ];
 assert.throws(()=>buildVerifiedComparisonReport(source),/AMBIGUOUS_COMPARISON_DOCUMENTS/);
});

test('invalid comparison inputs fail explicitly',()=>{
 assert.throws(()=>buildVerifiedComparisonReport(null),/INVALID_COMPARISON_INPUT/);
 assert.throws(()=>buildVerifiedComparisonReport(docs,{maxLeads:0}),/INVALID_COMPARISON_INPUT/);
});

test('cross-document repeated snippets are deduplicated by normalized text',()=>{
 const phrase='원고는 계약서에 기재된 지급기한을 다투고 있으며 별도의 합의가 없었다고 주장합니다.';
 const result=buildLocalIndex([
  {name:'one.pdf',pages:[{text:phrase}]},
  {name:'two.pdf',pages:[{text:phrase}]},
  {name:'three.pdf',pages:[{text:phrase}]}
 ]);
 assert.equal(result.repeated.length,1);
 assert.equal(result.repeated[0].first.document,'one.pdf');
 assert.equal(result.repeated[0].second.document,'two.pdf');
});

test('comparison cap is not reported as truncation when it exactly fits',()=>{
 const source=[
  {name:'one.pdf',pages:[{text:'원고는 갑 제42호증을 근거로 계약기간 5년을 주장한다.'}]},
  {name:'two.pdf',pages:[{text:'피고는 갑 제42호증을 근거로 계약기간 2년을 주장한다.'}]}
 ];
 const exact=buildVerifiedComparisonReport(source,{maxLeads:1});
 assert.equal(exact.leads.length,1);
 assert.equal(exact.diagnostics.truncated,false);
});
