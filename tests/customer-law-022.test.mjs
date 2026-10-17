import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertLegalWindowContinuation} from '../lib/gpt-legal-orchestrator.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const sourceVersion='a'.repeat(64),task='legal_elements';
const previous={caseId:'case',sourceVersion,task,cursor:0,nextCursor:4,complete:false,manifestSha256:'b'.repeat(64)};
previous.checkpointSha256=sha(JSON.stringify({sourceVersion,task,cursor:0,nextCursor:4,manifestSha256:previous.manifestSha256}));
test('LAW-022 enforces explicit continuation without trusting model memory',()=>{
 assert.equal(assertLegalWindowContinuation({previous:null,caseId:'case',sourceVersion,task,cursor:0}),true);
 assert.equal(assertLegalWindowContinuation({previous,caseId:'case',sourceVersion,task,cursor:4}),true);
 assert.throws(()=>assertLegalWindowContinuation({previous:null,caseId:'case',sourceVersion,task,cursor:4}),/CONTINUITY_MISMATCH/);
 assert.throws(()=>assertLegalWindowContinuation({previous:{...previous,checkpointSha256:'c'.repeat(64)},caseId:'case',sourceVersion,task,cursor:4}),/DIGEST_MISMATCH/);
 assert.throws(()=>assertLegalWindowContinuation({previous,caseId:'case',sourceVersion,task,cursor:5}),/CONTINUITY_MISMATCH/);
});
