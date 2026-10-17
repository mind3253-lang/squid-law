import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyClaimCandidate,claimSpeakerCandidate,extractClaimCandidates} from '../lib/legal-evidence-review.mjs';
test('LAW-018 negative admission is not treated as admission',()=>{
 assert.equal(classifyClaimCandidate('피고는 채무를 인정하지 않는다'),'rebuttal');
 assert.equal(classifyClaimCandidate('원고는 계약을 인정한다'),'admission');
});
test('LAW-018 speaker is unknown unless explicit and remains unverified',()=>{
 assert.equal(claimSpeakerCandidate('피고는 상계 주장').party,'defendant');
 assert.equal(claimSpeakerCandidate('원고는 계약 주장').party,'plaintiff');
 assert.equal(claimSpeakerCandidate('상대방은 주장').party,'unknown');
 const item=extractClaimCandidates({text:'피고는 채무를 인정하지 않는다',hash:'a'.repeat(64),documentId:'d',page:1,part:1})[0];
 assert.equal(item.speaker.party,'defendant');
 assert.equal(item.classification,'unverified_heuristic');
});
