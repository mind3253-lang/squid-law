import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
export const SOURCE_CONTINUITY_VERSION=1;

// An immutable, bounded work window. Continuation uses a cursor, not a model's assumed memory.
export function planSourceWindow({caseId,sourceVersion,units,cursor=0,maxCharacters=48000}){
 if(!caseId||!SHA.test(sourceVersion||'')||!Array.isArray(units)||!Number.isSafeInteger(cursor)||cursor<0||cursor>=units.length||!Number.isSafeInteger(maxCharacters)||maxCharacters<1000||maxCharacters>100000)throw Error('INVALID_SOURCE_WINDOW');
 const selected=[];let length=0;
 for(let i=cursor;i<units.length;i++){
  const u=units[i];
  if(!u||!u.documentId||!Number.isSafeInteger(u.page)||u.page<1||!Number.isSafeInteger(u.part)||u.part<1||!SHA.test(u.hash||'')||typeof u.text!=='string'||digest(u.text)!==u.hash)throw Error('SOURCE_WINDOW_HASH_MISMATCH');
  const row={documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,text:u.text};
  const size=JSON.stringify(row).length;
  if(size>maxCharacters)throw Error('SOURCE_UNIT_EXCEEDS_WINDOW');
  if(length+size>maxCharacters)break;
  selected.push(row);length+=size;
 }
 if(!selected.length)throw Error('EMPTY_SOURCE_WINDOW');
 const nextCursor=cursor+selected.length;
 const manifest={caseId,sourceVersion,cursor,nextCursor,totalUnits:units.length,sourceRefs:selected.map(({documentId,page,part,hash})=>({documentId,page,part,hash}))};
 return {manifest,manifestSha256:digest(JSON.stringify(manifest)),units:selected,complete:nextCursor===units.length};
}
export function verifySourceWindow(window,{caseId,sourceVersion,cursor,totalUnits}){
 if(!window||!window.manifest||!Array.isArray(window.units))throw Error('INVALID_SOURCE_WINDOW');
 const m=window.manifest;
 if(m.caseId!==caseId||m.sourceVersion!==sourceVersion||m.cursor!==cursor||m.totalUnits!==totalUnits||m.nextCursor!==cursor+window.units.length||m.nextCursor>totalUnits||window.manifestSha256!==digest(JSON.stringify(m)))throw Error('SOURCE_WINDOW_CHECKPOINT_MISMATCH');
 if(m.sourceRefs.length!==window.units.length)throw Error('SOURCE_WINDOW_REFERENCE_COUNT');
 for(let i=0;i<window.units.length;i++){
  const u=window.units[i],ref=m.sourceRefs[i];
  if(u.documentId!==ref.documentId||u.page!==ref.page||u.part!==ref.part||u.hash!==ref.hash||digest(u.text)!==ref.hash)throw Error('SOURCE_WINDOW_CONTENT_MISMATCH');
 }
 return {complete:true,nextCursor:m.nextCursor,remaining:totalUnits-m.nextCursor};
}
export function assertVisualSourceReady({sourceVersion,visualResult}){
 if(!SHA.test(sourceVersion||'')||!visualResult||visualResult.sourceVersion!==sourceVersion||visualResult.verified!==true||visualResult.independentAuditVerified!==true)throw Error('VISUAL_SOURCE_NOT_VERIFIED');
 return true;
}
