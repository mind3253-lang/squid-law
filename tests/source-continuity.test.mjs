import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planSourceWindow,verifySourceWindow,assertVisualSourceReady,buildVisualReferenceManifest} from '../lib/source-continuity.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const version='a'.repeat(64);
const units=Array.from({length:101},(_,i)=>({documentId:'doc',page:i+1,part:1,text:'법률 사건 자료 '+i+' '.repeat(300),hash:sha('법률 사건 자료 '+i+' '.repeat(300))}));
test('bounded windows cover every page exactly once across resumptions',()=>{
 let cursor=0,seen=[],rounds=0;
 while(cursor<units.length){
  const w=planSourceWindow({caseId:'case',sourceVersion:version,units,cursor,maxCharacters:1200});
  const check=verifySourceWindow(w,{caseId:'case',sourceVersion:version,cursor,totalUnits:units.length});
  seen.push(...w.units.map(u=>u.page));cursor=check.nextCursor;rounds++;
 }
 assert.deepEqual(seen,Array.from({length:101},(_,i)=>i+1));assert.ok(rounds>10);
});
test('tampered text, wrong version, or cursor cannot silently continue',()=>{
 const w=planSourceWindow({caseId:'case',sourceVersion:version,units,cursor:0,maxCharacters:1200});
 assert.throws(()=>verifySourceWindow({...w,units:[{...w.units[0],text:'forged'}]},{caseId:'case',sourceVersion:version,cursor:0,totalUnits:101}),/SOURCE_WINDOW_CONTENT_MISMATCH/);
 assert.throws(()=>verifySourceWindow(w,{caseId:'case',sourceVersion:'b'.repeat(64),cursor:0,totalUnits:101}),/SOURCE_WINDOW_CHECKPOINT_MISMATCH/);
 assert.throws(()=>verifySourceWindow(w,{caseId:'case',sourceVersion:version,cursor:1,totalUnits:101}),/SOURCE_WINDOW_CHECKPOINT_MISMATCH/);
});
test('oversized unit requires explicit smaller segmentation',()=>{
 assert.throws(()=>planSourceWindow({caseId:'case',sourceVersion:version,units:[{...units[0],text:'x'.repeat(2000),hash:sha('x'.repeat(2000))}],maxCharacters:1000}),/SOURCE_UNIT_EXCEEDS_WINDOW/);
});
test('visual evidence cannot be treated as complete without independent review',()=>{
 assert.throws(()=>assertVisualSourceReady({sourceVersion:version,visualResult:{sourceVersion:version,verified:true}}),/VISUAL_SOURCE_NOT_VERIFIED/);
 assert.equal(assertVisualSourceReady({sourceVersion:version,visualResult:{sourceVersion:version,verified:true,independentAuditVerified:true}}),true);
});

test('PDF visual manifest retains page, source digest and unverified status',()=>{
 const p={page:1,textSha256:sha('text'),textPresent:true,imageOperatorCount:2,visualInventoryStatus:'operator_scan_unverified'};
 const r=buildVisualReferenceManifest({caseId:'case',sourceVersion:version,documentId:'doc',sourcePdfSha256:sha('pdf'),pages:[p]});
 assert.equal(r.manifest.verified,false);
 assert.equal(r.manifest.references[0].requiresVisualReview,true);
 assert.equal(r.manifest.references[0].sourcePdfSha256,sha('pdf'));
 assert.throws(()=>buildVisualReferenceManifest({caseId:'case',sourceVersion:version,documentId:'doc',sourcePdfSha256:sha('pdf'),pages:[p,p]}),/INVALID_VISUAL_PAGE_REFERENCE/);
});
