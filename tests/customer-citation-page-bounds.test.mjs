import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCustomerAnalysisBrief} from '../lib/customer-analysis-brief.mjs';

const caseRecord={intake:{clientRole:'plaintiff',isFiledCase:false}};
const report={clientRole:'plaintiff',findings:[{
 issueKey:'미지급 사용료',type:'counterclaim',party:'plaintiff',
 claim:'원고는 미지급 사용료를 청구할 수 있다고 주장한다.',
 sources:[{documentId:'d1',page:12},{documentId:'d1',page:13}],
 evidenceNeed:'정산자료'
}]};
test('out-of-range and unverified page numbers are never presented as verified source locations',()=>{
 const result=buildCustomerAnalysisBrief({caseRecord,report,documents:[{id:'d1',name:'원본.pdf',pageCount:12}]});
 assert.match(result.text,/원본.pdf 12쪽/);
 assert.doesNotMatch(result.text,/원본.pdf 13쪽/);
});
test('unknown page counts cannot verify source locations',()=>{
 const result=buildCustomerAnalysisBrief({caseRecord,report,documents:[{id:'d1',name:'원본.pdf'}]});
 assert.doesNotMatch(result.text,/원본.pdf 12쪽/);
 assert.match(result.text,/출처 페이지 확인 필요/);
});
test('changed client role cannot silently reuse an old tailored report',()=>{
 assert.throws(()=>buildCustomerAnalysisBrief({caseRecord:{intake:{clientRole:'defendant',isFiledCase:false}},report,documents:[]}),/ANALYSIS_ROLE_CHANGED/);
});
