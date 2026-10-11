import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {verifyPageDigests} from '../lib/page-digests.mjs';
test('tampered page content is blocked before citation generation',()=>{
 const text='원본 계약서';
 const hash=createHash('sha256').update(text).digest('hex');
 assert.equal(verifyPageDigests([{page:1,text,textSha256:hash}]).complete,true);
 assert.equal(verifyPageDigests([{page:1,text:'변조된 계약서',textSha256:hash}]).complete,false);
});
test('legacy pages remain explicitly identifiable and new pages can require hashes',()=>{
 const legacy=[{page:1,text:'구형 원문'}];
 assert.equal(verifyPageDigests(legacy).legacyWithoutHashes,1);
 assert.equal(verifyPageDigests(legacy,{requireDigests:true}).complete,false);
});
