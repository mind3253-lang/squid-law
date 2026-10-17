import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
test('LAW-004: analysis requests handle timeout, invalid JSON and preserve jobs',()=>{assert.match(ui,/async function fullReviewRequest\(url,options=\{\}\)/);assert.match(ui,/setTimeout\(\(\)=>controller.abort\(\),25000\)/);assert.match(ui,/JSON이 아닌 응답/);assert.match(ui,/기존 작업은 보존됩니다/);assert.match(ui,/const j=await fullReviewRequest\('\/api\/customer-analysis-job/);assert.doesNotMatch(ui,/readFullReviewJson/);});
