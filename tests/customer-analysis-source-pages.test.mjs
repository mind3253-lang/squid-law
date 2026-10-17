import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../api/customer-analysis-job.js',import.meta.url),'utf8');
test('analysis enqueue and resume require verified PDF page counts and source digests',()=>{
 assert.match(api,/const verifiedSourcePages=docs=>/);
 assert.match(api,/Number\.isSafeInteger\(d\?\.pageCount\)&&d\.pageCount>0/);
 assert.match(api,/\[0-9a-f\]\{64\}/);
 assert.equal((api.match(/if\(!verifiedSourcePages\(docs\)\)return respond\(res,409/g)||[]).length,2);
 assert.match(api,/SOURCE_PAGES_NOT_VERIFIED/);
});
