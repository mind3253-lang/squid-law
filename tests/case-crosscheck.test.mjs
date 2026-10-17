import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {detectOpposingStatements} from '../lib/case-crosscheck.mjs';
test('opposing documents create only unverified contradiction candidates',()=>{
 const rows=[{claimCandidates:[{id:'a',text:'원고의 지급 주장을 인정한다',terms:['지급의무'],source:{documentId:'a',page:10,part:1,hash:'x'}}]},{claimCandidates:[{id:'b',text:'피고는 지급 주장을 부인한다',terms:['주장'],source:{documentId:'b',page:20,part:1,hash:'y'}}]}];
 const result=detectOpposingStatements(rows);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].status,'unverified_candidate');
 assert.equal(result.candidates[0].first.source.page,10);
 assert.equal(result.verified,false);
});
test('no false verified conflict when document and terms are the same',()=>{
 const rows=[{claimCandidates:[{id:'a',text:'주장을 인정한다',terms:['주장'],source:{documentId:'a'}}]},{claimCandidates:[{id:'b',text:'주장을 부인한다',terms:['주장'],source:{documentId:'a'}}]}];
 assert.equal(detectOpposingStatements(rows).candidates.length,0);
});
