import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {REQUIRED_ANALYSIS_GATES,validateCompletionGates,assertCompletionTransition} from '../lib/analysis-stage-gates.mjs';
test('text-only and visually incomplete jobs cannot be marked complete',()=>{
 const gates={sourceIntegrity:{verified:true,sourceVersion:'v'},textCoverage:{verified:true,sourceVersion:'v'}};
 assert.equal(validateCompletionGates(gates).complete,false);
 assert.throws(()=>assertCompletionTransition('completed',{gates}));
 assert.equal(assertCompletionTransition('blocked',{gates}),true);
});
test('all verified gates must agree on the source version',()=>{
 const gates=Object.fromEntries(REQUIRED_ANALYSIS_GATES.map(k=>[k,{verified:true,sourceVersion:'version1'}]));
 assert.equal(validateCompletionGates(gates).complete,true);
 assert.equal(assertCompletionTransition('completed',{gates}),true);
 gates.visualVerification.sourceVersion='version2';
 assert.equal(validateCompletionGates(gates).complete,false);
});

test('legal reasoning request requires source part receipts and independent audit',async()=>{
 const {buildLegalReasoningRequest}=await import('../lib/analysis-stage-gates.mjs');
 const sha='a'.repeat(64);
 const request=buildLegalReasoningRequest({caseId:'case',sourceVersion:sha,aggregatePath:'private/aggregate.json',aggregateSha256:sha,partPaths:['private/part-0.json'],partDigests:[sha]});
 assert.equal(request.status,'blocked_pending_visual_verification');
 assert.equal(request.ready,false);
 assert.equal(request.verified,false);
 assert.equal(request.requiresIndependentAudit,true);
 assert.throws(()=>buildLegalReasoningRequest({caseId:'case',sourceVersion:sha,aggregatePath:'private/aggregate.json',aggregateSha256:sha,partPaths:['private/part-0.json'],partDigests:[]}),/INVALID_LEGAL_REASONING_REQUEST/);
});
