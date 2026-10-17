import test from 'node:test';
import assert from 'node:assert/strict';
import {detectOpposingStatements} from '../lib/case-crosscheck.mjs';
const row=(id,doc,text,terms)=>({id,text,terms,source:{documentId:doc,page:1,part:1,hash:'a'.repeat(64)}});
test('LAW-020 does not invent a conflict from generic legal vocabulary',()=>{
 const result=detectOpposingStatements([{claimCandidates:[row('a','one','인정하였다',['주장'])]},{claimCandidates:[row('b','two','부인하였다',['주장'])]}]);
 assert.equal(result.candidates.length,0);
});
test('LAW-020 preserves opposite statements only as unverified candidates',()=>{
 const result=detectOpposingStatements([{claimCandidates:[row('a','one','계약 지급하였다',['계약'])]},{claimCandidates:[row('b','two','계약 미지급',['계약'])]}]);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].status,'unverified_candidate');
 assert.equal(result.candidates[0].sameSubjectVerified,false);
 assert.equal(result.candidates[0].speakerAttributionVerified,false);
 assert.equal(result.candidates[0].first.source.documentId,'one');
});
