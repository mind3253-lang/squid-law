import test from 'node:test';
import assert from 'node:assert/strict';
import {visionOutputBudget} from '../lib/openai-vision-provider.mjs';
test('PDF vision output scales with verified window length',()=>{
 assert.equal(visionOutputBudget(1),3000);
 assert.ok(visionOutputBudget(12)>6000);
 assert.ok(visionOutputBudget(20)<=16000);
});
test('reject invalid page counts before an API call',()=>{
 for(const n of [0,21,1.5,null])assert.throws(()=>visionOutputBudget(n),/VISION_WINDOW_PAGE_COUNT_INVALID/);
});
