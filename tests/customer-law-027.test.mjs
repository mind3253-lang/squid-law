import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTextReviewReport} from '../lib/text-review-report.mjs';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/customer-text-review-report.js',import.meta.url),'utf8');
test('LAW-027 report remains explicitly preliminary and not court-ready',()=>{
 const report=buildTextReviewReport({caseId:'SL-testcase',sourceVersion:'a'.repeat(64),coverage:[{pages:2}],verifiedLegal:false,verifiedVisual:false,opposingStatementCandidates:{candidates:[]},documentBoundaryCandidates:[],claimRoleSummary:{}});
 assert.equal(report.notForCourtSubmission,true);
 assert.equal(report.legalConclusionAvailable,false);
 assert.equal(report.visualVerificationAvailable,false);
 assert.equal(report.sourceCoverage[0].pages,2);
 assert.match(api,/report\.sourceVersion!==job\.documentVersion/);
 assert.match(api,/report\.legalConclusionAvailable!==false/);
 assert.match(api,/report\.visualVerificationAvailable!==false/);
 assert.match(api,/!validCoverage/);
});
