import test from 'node:test';
import assert from 'node:assert/strict';
import {courtSubmissionGate} from '../lib/court-submission-gate.mjs';
const ready={status:'reviewed',notForCourtSubmission:false,independentSemanticAuditPassed:true,sourceReferenceAuditPassed:true,legalAuthorityAudit:{complete:true},findings:[{claim:'x'}],issues:[]};
test('LAW-026 blocks missing audits, unresolved issues and draft findings',()=>{
 assert.equal(courtSubmissionGate({...ready,independentSemanticAuditPassed:false}).allowed,false);
 assert.equal(courtSubmissionGate({...ready,issues:['MISSING_EVIDENCE']}).allowed,false);
 assert.equal(courtSubmissionGate({...ready,legalAuthorityAudit:{complete:false}}).allowed,false);
 assert.equal(courtSubmissionGate({...ready,findings:[]}).allowed,false);
 assert.equal(courtSubmissionGate({...ready,status:'draft_pending_verification'}).allowed,false);
});
test('LAW-026 permits submission readiness only when every gate is explicit',()=>{
 assert.deepEqual(courtSubmissionGate(ready),{allowed:true,missing:[]});
 assert.equal(courtSubmissionGate({}).allowed,false);
});
