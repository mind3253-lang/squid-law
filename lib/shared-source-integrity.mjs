import {createHash} from 'node:crypto';
/** Shared, domain-neutral source integrity for SKYNET and SQUIDLAW. */
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyPageDigests(pages,{requireDigests=false}={}){
 if(!Array.isArray(pages))throw Error('INVALID_PAGE_DIGEST_INPUT');
 const failures=[];
 for(const p of pages){
  const actual=sha256(String(p?.text??''));
  if(p?.textSha256===undefined||p?.textSha256===null){if(requireDigests)failures.push({page:p?.page,reason:'MISSING_TEXT_HASH'});continue}
  if(p.textSha256!==actual)failures.push({page:p.page,reason:'PAGE_TEXT_HASH_MISMATCH'});
  if(p.imageOperatorCount!==undefined&&!p.visualOperatorDigest)failures.push({page:p.page,reason:'MISSING_VISUAL_OPERATOR_DIGEST'});
  if(p.visualOperatorDigest!==undefined){
   const visualHash=sha256(JSON.stringify([p.page,p.imageOperatorCount,p.visualInventoryStatus]));
   if(p.visualOperatorDigest!==visualHash)failures.push({page:p.page,reason:'VISUAL_OPERATOR_DIGEST_MISMATCH'});
  }
 }
 return {complete:failures.length===0,failures,legacyWithoutHashes:pages.filter(p=>!p?.textSha256).length};
}
export function assertPageBatch({pages,pageOffset,pageCount,batchSize=20}){
 if(!Number.isSafeInteger(pageOffset)||pageOffset<0||!Number.isSafeInteger(pageCount)||pageCount<1||!Number.isSafeInteger(batchSize)||batchSize<1||pageOffset>=pageCount||pageOffset%batchSize!==0)throw Error('INVALID_CHECKPOINT_OFFSET');
 const expected=Math.min(batchSize,pageCount-pageOffset);
 if(!Array.isArray(pages)||pages.length!==expected||pages.some((p,i)=>p?.page!==pageOffset+i+1))throw Error('INVALID_PAGE_SEQUENCE');
 return {startPage:pageOffset+1,endPage:pageOffset+expected,finished:pageOffset+expected===pageCount,nextOffset:pageOffset+expected};
}
export function assertBatchManifest({batches,pageCount,batchSize=20}){
 if(!Array.isArray(batches)||!Number.isSafeInteger(pageCount)||pageCount<1||batches.length!==Math.ceil(pageCount/batchSize)||batches.some(p=>typeof p!=='string'||!p.endsWith('.json'))||new Set(batches).size!==batches.length)throw Error('INVALID_BATCH_MANIFEST');
 return true;
}
export function auditPageCoverage({pageCount,batches}){
 if(!Number.isSafeInteger(pageCount)||pageCount<1||!Array.isArray(batches))throw Error('INVALID_PAGE_COVERAGE_INPUT');
 const seen=new Set();
 for(const batch of batches){
  if(!Array.isArray(batch?.pages))throw Error('INVALID_PAGE_BATCH');
  for(const page of batch.pages){
   const n=page?.page;
   if(!Number.isSafeInteger(n)||n<1||n>pageCount)throw Error('PAGE_OUT_OF_RANGE');
   if(seen.has(n))throw Error('DUPLICATE_PAGE');
   seen.add(n);
  }
 }
 const missing=[];for(let n=1;n<=pageCount;n++)if(!seen.has(n))missing.push(n);
 return {complete:missing.length===0,verifiedPages:seen.size,pageCount,missingPages:missing};
}
export function uploadDigest(parts){
 if(!Array.isArray(parts)||parts.some(p=>!Buffer.isBuffer(p)))throw Error('INVALID_PARTS');
 const h=createHash('sha256');let size=0;for(const p of parts){size+=p.length;h.update(p)}
 return {size,sha256:h.digest('hex')};
}
