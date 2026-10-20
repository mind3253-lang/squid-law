import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSkynetMemory,skynetOwnerKey} from '../lib/skynet-memory-policy.mjs';
import {skynetProgress} from '../lib/skynet-progress.mjs';
test('SKYNET owner keys isolate identities',()=>assert.notEqual(skynetOwnerKey('member-a'),skynetOwnerKey('member-b')));
test('memory requires monotonic revision',()=>{
 const one=mergeSkynetMemory(null,{key:'style',value:'concise',revision:1});
 assert.throws(()=>mergeSkynetMemory(one,{key:'style',value:'verbose',revision:3}),/CONFLICT/);
 assert.equal(mergeSkynetMemory(one,{key:'style',value:'verbose',revision:2}).revision,2);
});
test('progress color follows configured bands',()=>{
 assert.equal(skynetProgress({completed:1,total:10}).color,'yellow');
 assert.equal(skynetProgress({completed:5,total:10}).color,'blue');
 assert.equal(skynetProgress({completed:9,total:10}).color,'green');
});
