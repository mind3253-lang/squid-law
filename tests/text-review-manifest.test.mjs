import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {expectedTextReviewOutputs,auditTextReviewOutputs} from '../lib/text-review-manifest.mjs';
test('338-page review cannot finish without all 17 durable outputs',()=>{
 const expected=expectedTextReviewOutputs({root:'private/job/',documents:[{id:'d',pageCount:338}]});
 assert.equal(expected.length,17);
 assert.equal(auditTextReviewOutputs({expected,actual:expected}).complete,true);
 const missing=auditTextReviewOutputs({expected,actual:expected.slice(0,16)});
 assert.equal(missing.complete,false);assert.equal(missing.missing.length,1);
});
test('multi-document manifests detect duplicate and unexpected outputs',()=>{
 const expected=expectedTextReviewOutputs({root:'private/job/',documents:[{id:'a',pageCount:21},{id:'b',pageCount:40}]});
 assert.equal(expected.length,4);
 assert.equal(auditTextReviewOutputs({expected,actual:[...expected,expected[0]]}).complete,false);
 assert.equal(auditTextReviewOutputs({expected,actual:[...expected,'private/job/fake.json']}).unexpected.length,1);
});
