import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildLegalCustomerReport} from '../lib/legal-customer-report.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const version='a'.repeat(64),text='계약기간은 5년';
const source={documentId:'doc',page:1,part:1,hash:sha(text)};
const request={caseId:'case',sourceVersion:version,ready:true,verified:false};
const finding={type:'claim',claim:'계약기간 5년 주장',sources:[source],status:'draft'};
const window={caseId:'case',sourceVersion:version,cursor:0,nextCursor:1,complete:true,sourceAudit:{complete:true},verified:false,findings:[finding],uncertainties:[]};
test('source-cited GPT report remains draft without independent semantic audit',()=>{
 const report=buildLegalCustomerReport({request,windows:[window],sourceIndex:[source]});
 assert.equal(report.sourceReferenceAuditPassed,true);
 assert.equal(report.notForCourtSubmission,true);
 assert.equal(report.legalConclusionAvailable,false);
 assert.ok(report.issues.includes('INDEPENDENT_SEMANTIC_AUDIT_PENDING'));
});
test('unverified and forged citations cannot produce a reviewed report',()=>{
 const forged={...window,findings:[{...finding,sources:[{...source,hash:'b'.repeat(64)}]}]};
 const report=buildLegalCustomerReport({request,windows:[forged],sourceIndex:[source],independentAudit:{caseId:'case',sourceVersion:version,verified:true}});
 assert.equal(report.status,'draft_pending_verification');
 assert.equal(report.sourceReferenceAuditPassed,false);
});
test('window gaps are visible and block legal conclusion',()=>{
 const gap={...window,cursor:3,nextCursor:4};
 const report=buildLegalCustomerReport({request,windows:[window,gap],sourceIndex:[source]});
 assert.equal(report.notForCourtSubmission,true);
 assert.ok(report.issues.some(x=>x.startsWith('WINDOW_CONTINUITY')));
});
