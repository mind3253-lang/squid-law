import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uri=s=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(s).replace(/'/g,'%27');
const verificationUri=uri(read('source-verification.js'));
const reportSource=read('analysis-case-report.js').replace("'./source-verification.js'","'"+verificationUri+"'");
const reportUri=uri(reportSource);
const {assembleVerifiedCaseAnalysis}=await import(reportUri);
const reportTextSource=read('analysis-case-report-text.js');
const {formatCaseReportText}=await import(uri(reportTextSource));
const documents=[
 {name:'원고.pdf',pages:[{text:'원고는 계약기간이 5년이라고 주장한다.'}]},
 {name:'피고.pdf',pages:[{text:'피고는 계약기간이 2년이라고 주장한다.'}]}
];
const original={document:'원고.pdf',page:1,quote:'계약기간이 5년이라고 주장한다.'};
const opposing={document:'피고.pdf',page:1,quote:'계약기간이 2년이라고 주장한다.'};
const finding={title:'계약기간',citations:[original],citationChecks:[{verification:{status:'matched'}}]};
const analysis={schema:'squidlaw-merged-analysis-v1',sourceReady:true,diagnostics:{missingBatches:[]},findings:[finding]};
const comparison={schema:'squidlaw-private-comparisons-v1',sourceReady:true,diagnostics:{},comparisons:[{reference:'소갑 제3호증',relation:'different_positions',explanation:'계약기간이 다름',sourceReady:true,citations:[original,opposing]}]};
const report=assembleVerifiedCaseAnalysis(documents,analysis,comparison);
assert.equal(report.status,'source_checked');
assert.equal(report.diagnostics.verifiedCitationCount,3);
assert.match(formatCaseReportText(report),/출처 검산: 원문 일치/);
const forgedAnalysis={...analysis,findings:[{...finding,citations:[{...original,quote:'계약기간이 3년이라고 주장한다.'}],citationChecks:[{verification:{status:'matched'}}]}]};
const forged=assembleVerifiedCaseAnalysis(documents,forgedAnalysis,comparison);
assert.equal(forged.status,'needs_source_review');
assert.equal(forged.diagnostics.unverifiedCitationCount,1);
assert.match(formatCaseReportText(forged),/출처 검산: 확인 필요/);
const forgedComparison={...comparison,comparisons:[{...comparison.comparisons[0],citations:[original,{...opposing,quote:'계약기간이 7년이라고 주장한다.'}]}]};
const mismatched=assembleVerifiedCaseAnalysis(documents,analysis,forgedComparison);
assert.equal(mismatched.status,'needs_source_review');
assert.match(formatCaseReportText(mismatched),/출처 확인이 필요한 비교 후보: 1건/);
const partial=assembleVerifiedCaseAnalysis([...documents,{name:'스캔.pdf',pages:[{text:''}]}],analysis,comparison);
assert.equal(partial.status,'source_checked_partial');
assert.match(formatCaseReportText(partial),/일부 페이지 미식별/);
for(const invalid of [[],[{name:'빈문서.pdf',pages:[]}]])assert.throws(()=>assembleVerifiedCaseAnalysis(invalid,analysis,comparison),/INVALID_DOCUMENTS/);
console.log('PASS: source verification through final report text; forged citations cannot pass');
