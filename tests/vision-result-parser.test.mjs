import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {parseVisionObservation,verifyOcrAgainstPage} from '../lib/vision-result-parser.mjs';
test('vision text remains unverified until independent OCR review',()=>{
 const hash='a'.repeat(64);
 const observation=parseVisionObservation({documentId:'doc',page:5,imageSha256:hash,response:{observedText:'서명',visualFacts:['도장'],uncertainties:['날짜 불명']}});
 assert.equal(observation.accepted,true);
 assert.equal(observation.verified,false);
 assert.equal(parseVisionObservation({documentId:'doc',page:5,imageSha256:hash,response:JSON.stringify({mock:true,observedText:'서명',visualFacts:[],uncertainties:[]})}).accepted,false);
 assert.equal(verifyOcrAgainstPage({observation:observation.observation,sourcePage:{documentId:'doc',page:5}}).complete,false);
 assert.equal(parseVisionObservation({documentId:'doc',page:5,imageSha256:hash,response:{mock:true,observedText:'서명',visualFacts:[],uncertainties:[]}}).accepted,false);
});
