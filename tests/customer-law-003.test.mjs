import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
test('LAW-003: failure diagnostics contain operation, endpoint, status, code without response body',()=>{assert.match(ui,/function fullReviewFailure\(method,url,status,code\)/);assert.match(ui,/SQUIDLAW_ANALYSIS_REQUEST_FAILURE/);assert.match(ui,/String\(url\)\.split\('\?'\)\[0\]/);assert.match(ui,/NON_JSON_RESPONSE/);assert.match(ui,/REQUEST_TIMEOUT/);assert.match(ui,/기존 작업은 보존됩니다/);});
