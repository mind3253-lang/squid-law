import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../lib/customer-analysis-brief.mjs',import.meta.url),'utf8');
test('paid report does not truncate issue groups at eight',()=>{
 assert.match(src,/const selected=groups;/);
 assert.doesNotMatch(src,/groups\.slice\(0,8\)/);
 assert.match(src,/displayedIssues:selected\.length/);
});
test('customer report includes a distinct source-grounded offensive review',()=>{
 assert.match(src,/제4장\. 의뢰인에게 유리한 공격·반대청구 검토/);
 assert.match(src,/f\.type==='counterclaim'/);
 assert.match(src,/sourceFootnote\(g,names\)/);
 assert.match(src,/chapterCount:4/);
});
