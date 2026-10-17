import test from 'node:test';
import assert from 'node:assert/strict';
import {compareIndependentVisualPass} from '../lib/visual-review-audit.mjs';
const observation={pageObservations:[{page:1,observedText:'증거',visualFacts:[],uncertainties:[]}],unreviewedPages:[]};
const primary={documentId:'doc',sourcePdfSha256:'a'.repeat(64),providerResponseId:'run-1',observations:observation};
const secondary={...primary,providerResponseId:'run-2',auditPass:true};
test('LAW-015 independent visual pass requires distinct provider runs',()=>{
 assert.equal(compareIndependentVisualPass({primary,secondary,pageCount:1}).complete,true);
 assert.equal(compareIndependentVisualPass({primary,secondary:{...secondary,providerResponseId:'run-1'},pageCount:1}).complete,false);
});
test('LAW-015 rejects malformed primary observations',()=>{
 const malformed={...primary,observations:{...observation,pageObservations:[{...observation.pageObservations[0],visualFacts:null}]}};
 assert.equal(compareIndependentVisualPass({primary:malformed,secondary,pageCount:1}).complete,false);
});
