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

test('visual operator inventory tampering is detected independently of text hash',()=>{
 const text='계약서',page=1,imageOperatorCount=2,visualInventoryStatus='operator_scan_unverified';
 const textSha256=createHash('sha256').update(text).digest('hex');
 const visualOperatorDigest=createHash('sha256').update(JSON.stringify([page,imageOperatorCount,visualInventoryStatus])).digest('hex');
 const original={page,text,textSha256,imageOperatorCount,visualInventoryStatus,visualOperatorDigest};
 assert.equal(verifyPageDigests([original],{requireDigests:true}).complete,true);
 assert.equal(verifyPageDigests([{...original,imageOperatorCount:3}],{requireDigests:true}).complete,false);
 assert.equal(verifyPageDigests([{...original,visualOperatorDigest:undefined}],{requireDigests:true}).complete,false);
});
