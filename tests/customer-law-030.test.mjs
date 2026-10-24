import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
test('LAW-030: customer status includes actionable next step and safe error code',()=>{for(const s of ['queued','running','retry','blocked','failed','completed'])assert.match(ui,new RegExp('  '+s+':'));assert.match(ui,/nextStep\.textContent=nextByStatus\[state\]/);assert.match(ui,/errorLine\.textContent=safeError\?'오류 코드: '\+safeError/);assert.match(ui,/fullReviewPanel\.replaceChildren\(/);assert.match(ui,/billingLine/);assert.match(ui,/nextStep/);assert.match(ui,/errorLine/);});
