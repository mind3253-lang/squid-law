import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyCustomerChunkDigest} from '../api/customer-large-upload.js';
test('LAW-040 accepts intact chunk and rejects corrupted or missing digest',()=>{
 const chunk=Buffer.from('immutable original PDF chunk');
 const sha=createHash('sha256').update(chunk).digest('hex');
 assert.equal(verifyCustomerChunkDigest(chunk,sha),true);
 assert.throws(()=>verifyCustomerChunkDigest(Buffer.from('changed'),sha),/DIGEST_MISMATCH/);
 assert.throws(()=>verifyCustomerChunkDigest(chunk,''),/DIGEST_REQUIRED/);
});
