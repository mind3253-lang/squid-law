import test from 'node:test';
import assert from 'node:assert/strict';
import {issueGabiaSession,verifyGabiaSession} from '../server/gabia-session.mjs';
import {requireRole,requireOwner} from '../server/gabia-role-policy.mjs';
import {hashGabiaPassword,verifyGabiaPassword} from '../server/gabia-password.mjs';
const secret='example-test-secret-at-least-32-bytes-long';
test('signed role session expires and rejects tampering',()=>{
 const now=1700000000000,token=issueGabiaSession({subject:'customer-1',role:'customer',secret,now,ttlSeconds:60});
 assert.equal(verifyGabiaSession(token,{secret,now}).role,'customer');
 assert.equal(verifyGabiaSession(token,{secret,now:now+61000}),null);
 assert.equal(verifyGabiaSession(token+'x',{secret,now}),null);
});
test('customer cannot claim admin privilege',()=>{
 const identity={subject:'customer-1',role:'customer'};
 assert.throws(()=>requireRole(identity,'admin'),/FORBIDDEN/);
 assert.throws(()=>requireOwner(identity,'customer-2'),/FORBIDDEN/);
});
test('password hashes use unique salts and reject invalid password',()=>{
 const a=hashGabiaPassword('very-long-password-123'),b=hashGabiaPassword('very-long-password-123');
 assert.notEqual(a,b);
 assert.equal(verifyGabiaPassword('very-long-password-123',a),true);
 assert.equal(verifyGabiaPassword('wrong-password',a),false);
});
