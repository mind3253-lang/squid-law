import assert from 'node:assert/strict';
import {assembleCaseAnalysis,assembleVerifiedCaseAnalysis} from '../analysis-case-report.js';
const check={verification:{status:'matched'}};
const analysis={
 schema:'squidlaw-merged-analysis-v1',
 sourceReady:true,
 diagnostics:{missingBatches:[]},
 findings:[{title:'원고의 계약기간 주장',citations:[{document:'원고.pdf',page:1,quote:'계약기간 5년을 주장한다'}],citationChecks:[check]}]
};
const comparison={
 schema:'squidlaw-private-comparisons-v1',
 sourceReady:true,
 diagnostics:{processed:1},
 comparisons:[{
  reference:'소갑 제3호증',relation:'different_positions',explanation:'양측 기간 주장이 다르다',
  sourceReady:true,
  citations:[
   {document:'원고.pdf',page:1,quote:'계약기간 5년을 주장한다',verification:{status:'matched'}},
   {document:'피고.pdf',page:1,quote:'계약기간 2년을 주장한다',verification:{status:'matched'}}
  ]
 }]
};
const report=assembleCaseAnalysis(analysis,comparison);
assert.equal(report.status,'source_checked');
assert.equal(report.findings.length,1);
assert.equal(report.comparisons.length,1);
assert.equal(report.diagnostics.comparisonNotPerformed,false);
const emptyComparisons={...comparison,comparisons:[]};
const withoutComparison=assembleCaseAnalysis(analysis,emptyComparisons);
assert.equal(withoutComparison.status,'source_checked');
assert.equal(withoutComparison.diagnostics.comparisonNotPerformed,true);
assert.ok(withoutComparison.notices.some(x=>x.includes('서면 비교를 수행하지 않았습니다')));
assert.match(report.notices[0],/진위/);
assert.equal(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citationChecks:[{verification:{status:'unmatched'}}]}]},comparison).status,'needs_source_review');
assert.equal(assembleCaseAnalysis(analysis,{...comparison,comparisons:[{...comparison.comparisons[0],citations:[{...comparison.comparisons[0].citations[0],verification:{status:'unmatched'}},comparison.comparisons[0].citations[1]]}]}).status,'needs_source_review');
assert.throws(()=>assembleCaseAnalysis({},comparison),/INVALID_ANALYSIS_RESULT/);
assert.equal(assembleCaseAnalysis({...analysis,findings:[]},comparison).status,'needs_source_review');
assert.equal(assembleCaseAnalysis({...analysis,diagnostics:{missingBatches:[2]}},comparison).status,'needs_source_review');
assert.equal(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[analysis.findings[0].citations[0],analysis.findings[0].citations[0]],citationChecks:[check]}]},comparison).status,'needs_source_review');
console.log('PASS: unified case report requires source-checked findings and both comparison quotes');

assert.throws(()=>assembleCaseAnalysis({...analysis,findings:[null]},comparison),/INVALID_REPORT_ENTRY/);
assert.throws(()=>assembleCaseAnalysis(analysis,{...comparison,comparisons:[null]}),/INVALID_REPORT_ENTRY/);
assert.equal(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citationChecks:[null]}]},comparison).status,'needs_source_review');
assert.equal(assembleCaseAnalysis(analysis,{...comparison,comparisons:[{...comparison.comparisons[0],citations:[null,comparison.comparisons[0].citations[1]]}]}).status,'needs_source_review');

const reportDocuments=[
 {name:'원고.pdf',pages:[{text:'원고는 계약기간 5년을 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 계약기간 2년을 주장한다.'}]}
];
assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,{...analysis,findings:[{...analysis.findings[0],citations:[null]}]},comparison),/INVALID_REPORT_ENTRY/);
assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,analysis,{...comparison,comparisons:[{...comparison.comparisons[0],citations:[null,comparison.comparisons[0].citations[1]]}]}),/INVALID_REPORT_ENTRY/);

const malformedCitation={document:'원고.pdf',page:'1',quote:'계약기간 5년을 주장한다'};
assert.equal(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[malformedCitation]}]},comparison).status,'needs_source_review');
assert.equal(assembleCaseAnalysis(analysis,{...comparison,comparisons:[{...comparison.comparisons[0],citations:[{...comparison.comparisons[0].citations[0],quote:''},comparison.comparisons[0].citations[1]]}]}).status,'needs_source_review');

assert.equal(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{document:'원고.pdf',page:1,quote:'짧음'}]}]},comparison).status,'needs_source_review');

for(const invalid of [[null], [{name:'원고.pdf',pages:null}], [{name:'원고.pdf',pages:[null]}], [{name:'원고.pdf',pages:[{text:42}]}], [{name:'',pages:[]}]])assert.throws(()=>assembleVerifiedCaseAnalysis(invalid,analysis,comparison),/INVALID_DOCUMENTS/);

assert.throws(()=>assembleVerifiedCaseAnalysis([reportDocuments[0],reportDocuments[0]],analysis,comparison),/DUPLICATE_DOCUMENT_NAME/);

assert.equal(assembleCaseAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{document:'원고.pdf',page:1,quote:'가          나'}]}]},comparison).status,'needs_source_review');

for(const diagnostics of ['invalid',1,true]){
 assert.throws(()=>assembleCaseAnalysis({...analysis,diagnostics},comparison),/INVALID_ANALYSIS_RESULT/);
 assert.throws(()=>assembleCaseAnalysis(analysis,{...comparison,diagnostics}),/INVALID_COMPARISON_RESULT/);
}

assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,{...analysis,schema:'wrong'},comparison),/INVALID_ANALYSIS_RESULT/);
assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,analysis,{...comparison,schema:'wrong'}),/INVALID_COMPARISON_RESULT/);
assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,{...analysis,diagnostics:null},comparison),/INVALID_ANALYSIS_RESULT/);

for(const diagnostics of [[],{missingBatches:'none'},{missingBatches:1},{missingBatches:{}}]){
 assert.throws(()=>assembleCaseAnalysis({...analysis,diagnostics},comparison),/INVALID_ANALYSIS_RESULT/);
 assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,{...analysis,diagnostics},comparison),/INVALID_ANALYSIS_RESULT/);
}
assert.throws(()=>assembleCaseAnalysis(analysis,{...comparison,diagnostics:[]}),/INVALID_COMPARISON_RESULT/);
assert.throws(()=>assembleVerifiedCaseAnalysis(reportDocuments,analysis,{...comparison,diagnostics:[]}),/INVALID_COMPARISON_RESULT/);
