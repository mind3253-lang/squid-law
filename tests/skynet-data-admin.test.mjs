import test from 'node:test';
import assert from 'node:assert/strict';
import {isTemporaryPath} from '../api/skynet-data-admin.js';
test('only explicitly marked temporary paths are deletable',()=>{
 for(const p of ['skynet/test/a.json','skynet/imports/test-123.json','skynet/documents/임시-자료.json'])assert.equal(isTemporaryPath(p),true,p);
 for(const p of ['skynet/imports/case.json','skynet/db/backup.json','skynet/records/abc.json','skynet/search-index/a.json','other/test.json','skynet/imports/../test.json'])assert.equal(isTemporaryPath(p),false,p);
});
