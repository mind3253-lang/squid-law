import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {buildTextReviewReport} from '../lib/text-review-report.mjs';
const sourceVersion='a'.repeat(64);
const aggregate={caseId:'case',sourceVersion,coverage:[{documentId:'d',pages:338,textBatchCount:17}],observationCount:338,verifiedLegal:false,verifiedVisual:false,claimRoleSummary:{counts:{claim:1},verified:false},documentBoundaryCandidates:[{documentId:'d',sections:[],verified:false}],opposingStatementCandidates:{candidates:[{first:{text:'지급하였다',source:{documentId:'a',page:2,part:1,hash:'b'.repeat(64)}},second:{text:'지급하지 않았다',source:{documentId:'b',page:5,part:1,hash:'c'.repeat(64)}},sharedTerms:['지급']}]},crossDocumentEvidenceLinks:[{kind:'same_amount',value:'100만원',references:[{documentId:'a',page:2,part:1},{documentId:'b',page:5,part:1}]}]};
test('intermediate report cites original pages and cannot masquerade as final legal analysis',()=>{
 const report=buildTextReviewReport(aggregate);
 assert.equal(report.reportType,'text_review_only');
 assert.equal(report.notForCourtSubmission,true);
 assert.equal(report.legalConclusionAvailable,false);
 assert.equal(report.opposingStatementCandidates[0].first.source.page,2);
 assert.equal(report.opposingStatementCandidates[0].second.source.documentId,'b');
 assert.equal(report.crossDocumentEvidenceLinks[0].sources.length,2);
});
test('intermediate report rejects false visual or legal completion',()=>{
 assert.throws(()=>buildTextReviewReport({...aggregate,verifiedLegal:true}),/INVALID_TEXT_REVIEW_REPORT_SOURCE/);
 assert.throws(()=>buildTextReviewReport({...aggregate,verifiedVisual:true}),/INVALID_TEXT_REVIEW_REPORT_SOURCE/);
});
