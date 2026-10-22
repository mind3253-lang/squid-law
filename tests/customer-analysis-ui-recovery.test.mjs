import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
test('customer analysis never exposes non-JSON gateway body',()=>{
 const parser=html.slice(html.indexOf('async function fullReviewRequest('),html.indexOf('async function fullReviewStatus('));
 assert.match(parser,/await r\.text\(\)/);
 assert.match(parser,/JSON|응답/);
 assert.doesNotMatch(parser,/raw\.slice\(/);
});
test('transient status failures preserve persisted full-review job identifier',()=>{
 const restore=html.slice(html.indexOf('async function restoreFullReview()'),html.indexOf('fullReviewButton.onclick=',html.indexOf('async function restoreFullReview()')));
 assert.match(restore,/await fullReviewStatus\(id,select\.value\)/);
 assert.match(restore,/ANALYSIS_JOB_NOT_FOUND/);
 assert.match(restore,/sessionStorage\.removeItem/);
 assert.match(restore,/기존 분석 작업을 보존했습니다/);
});
