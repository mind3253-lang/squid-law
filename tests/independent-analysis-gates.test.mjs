import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSemanticReview} from '../lib/independent-semantic-review.mjs';
test('semantic audit rejects unsupported finding',()=>{const r=validateSemanticReview({response:{caseId:'case',sourceVersion:'v',verdicts:[{index:0,supported:false,reason:'unsupported'}]},caseId:'case',sourceVersion:'v',findings:[{claim:'a'}]});assert.equal(r.complete,false)});
