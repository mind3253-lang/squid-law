import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditFinalizationResumePrefix} from '../lib/finalization-checkpoint.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourceVersion='a'.repeat(64);
const part={offset:0,sourceVersion,batchCount:8,unitCount:2,claims:[],observations:[],boundaries:[],sources:[{},{}]};
const checkpoint={finalizeOffset:8,finalizeUnitCount:2,finalizePartDigests:[sha(part)]};
test('LAW-002 validates persisted prefix before continuing finalization',()=>{
 assert.equal(auditFinalizationResumePrefix({parts:[part],checkpoint,descriptorCount:12,sourceVersion}).verifiedUnits,2);
 assert.throws(()=>auditFinalizationResumePrefix({parts:[],checkpoint,descriptorCount:12,sourceVersion}),/PART_MISSING/);
 assert.throws(()=>auditFinalizationResumePrefix({parts:[{...part,unitCount:3}],checkpoint,descriptorCount:12,sourceVersion}),/DIGEST_MISMATCH/);
 assert.throws(()=>auditFinalizationResumePrefix({parts:[part],checkpoint:{...checkpoint,finalizeUnitCount:4},descriptorCount:12,sourceVersion}),/COUNT_MISMATCH/);
});
