import {auditTextReviewOutputs,expectedTextReviewOutputs} from './text-review-manifest.mjs';
import {detectOpposingStatements} from './case-crosscheck.mjs';

/**
 * Deterministic aggregation of persisted text batches.
 * This is a text-only, unverified candidate report, NEVER a legal merits audit.
 */
export function aggregateTextReview({caseId,sourceVersion,root,documents,outputs}){
 if(!caseId||!/^[a-f0-9]{64}$/.test(sourceVersion||'')||!Array.isArray(documents)||documents.length===0||!Array.isArray(outputs))throw Error('INVALID_AGGREGATION_INPUT');
 const expected=expectedTextReviewOutputs({root,documents});
 const paths=outputs.map(o=>o?.path);
 const audit=auditTextReviewOutputs({expected,actual:paths});
 if(!audit.complete)throw Error('TEXT_OUTPUT_MANIFEST_MISMATCH');
 const byPath=new Map(outputs.map(o=>[o.path,o.payload]));
 const observations=[],coverage=[];
 for(const d of documents){
  let nextPage=1;
  for(let offset=0;offset<d.pageCount;offset+=20){
   const path=root+d.id+'-'+String(offset).padStart(8,'0')+'.json';
   const batch=byPath.get(path);
   const count=Math.min(20,d.pageCount-offset);
   if(!batch||batch.documentId!==d.id||batch.sourceVersion!==sourceVersion||batch.pageStart!==nextPage||batch.pageCount!==count||batch.verifiedText!==true||!Array.isArray(batch.results))throw Error('TEXT_BATCH_INVALID');
   if(batch.visualVerified!==false||batch.visualInventoryComplete!==false)throw Error('UNEXPECTED_VISUAL_COMPLETION');
   if(!Number.isSafeInteger(batch.unitCount)||batch.unitCount!==batch.results.length)throw Error('TEXT_UNIT_COUNT_MISMATCH');
   if(batch.results.some(result=>!result||typeof result!=='object'))throw Error('INVALID_TEXT_OBSERVATION');
   const unitKeys=new Set(),pageParts=new Map(),pagePartTotals=new Map();
   for(const result of batch.results){
    if(result.status!=='verified'||result.documentId!==d.id||!Number.isSafeInteger(result.page)||result.page<nextPage||result.page>=nextPage+count||!Number.isSafeInteger(result.part)||result.part<0||!(/^[a-f0-9]{64}$/.test(result.hash||''))||!(/^[a-f0-9]{64}$/.test(result.textHash||'')))throw Error('INVALID_TEXT_RESULT_PROVENANCE');
    const key=result.page+':'+result.part;
    if(unitKeys.has(key))throw Error('DUPLICATE_TEXT_UNIT');
    unitKeys.add(key);
    if(!pageParts.has(result.page))pageParts.set(result.page,[]);
    pageParts.get(result.page).push(result.part);
    if(!Number.isSafeInteger(result.parts)||result.parts<1||result.part>result.parts)throw Error('INVALID_TEXT_PART_TOTAL');
    if(pagePartTotals.has(result.page)&&pagePartTotals.get(result.page)!==result.parts)throw Error('INCONSISTENT_TEXT_PART_TOTAL');
    pagePartTotals.set(result.page,result.parts);
    if(!Array.isArray(result.claimCandidates)||!Array.isArray(result.observations))throw Error('INVALID_TEXT_RESULT_SHAPE');
    for(const claim of [...result.claimCandidates,...result.observations]){
     if(!claim||typeof claim!=='object'||claim.source?.documentId!==d.id||claim.source?.page!==result.page||claim.source?.part!==result.part||claim.source?.hash!==result.hash)throw Error('INVALID_CANDIDATE_PROVENANCE');
    }
   }
   for(let page=nextPage;page<nextPage+count;page++){
    const parts=(pageParts.get(page)||[]).sort((a,b)=>a-b);
    if(!parts.length||parts.length!==pagePartTotals.get(page)||parts.some((part,i)=>part!==i+1))throw Error('TEXT_PAGE_UNIT_COVERAGE_INCOMPLETE');
   }
   for(const result of batch.results)observations.push(result);
   nextPage+=count;
  }
  if(nextPage!==d.pageCount+1)throw Error('DOCUMENT_COVERAGE_INCOMPLETE');
  coverage.push({documentId:d.id,pages:d.pageCount,textBatchCount:Math.ceil(d.pageCount/20)});
 }
 const opposing=detectOpposingStatements(observations);
 return {caseId,sourceVersion,coverage,observationCount:observations.length,opposingStatementCandidates:opposing,verifiedLegal:false,verifiedVisual:false,status:'awaiting_visual_and_semantic_review'};
}

export function validatePersistedBatch({batch,documentId,sourceVersion,pageStart,pageCount}){
 if(!batch||batch.documentId!==documentId||batch.sourceVersion!==sourceVersion||batch.pageStart!==pageStart||batch.pageCount!==pageCount||batch.verifiedText!==true||batch.visualVerified!==false||batch.visualInventoryComplete!==false||!Array.isArray(batch.results)||batch.unitCount!==batch.results.length)throw Error('INVALID_PERSISTED_BATCH');
 const pages=new Map();
 for(const result of batch.results){
  if(!result||result.status!=='verified'||result.documentId!==documentId||!Number.isSafeInteger(result.page)||result.page<pageStart||result.page>=pageStart+pageCount||!Number.isSafeInteger(result.part)||result.part<1||!Number.isSafeInteger(result.parts)||result.parts<result.part||!Array.isArray(result.claimCandidates)||!Array.isArray(result.observations)||!/^[a-f0-9]{64}$/.test(result.hash||'')||!/^[a-f0-9]{64}$/.test(result.textHash||''))throw Error('INVALID_PERSISTED_UNIT');
  const entry=pages.get(result.page)||{total:result.parts,parts:new Set()};
  if(entry.total!==result.parts||entry.parts.has(result.part))throw Error('DUPLICATE_PERSISTED_PART');
  entry.parts.add(result.part);pages.set(result.page,entry);
  for(const item of [...result.claimCandidates,...result.observations])if(!item||item.source?.documentId!==documentId||item.source?.page!==result.page||item.source?.part!==result.part||item.source?.hash!==result.hash)throw Error('INVALID_PERSISTED_SOURCE');
 }
 for(let page=pageStart;page<pageStart+pageCount;page++){
  const entry=pages.get(page);if(!entry||entry.parts.size!==entry.total)throw Error('INCOMPLETE_PERSISTED_PAGE');
  for(let part=1;part<=entry.total;part++)if(!entry.parts.has(part))throw Error('MISSING_PERSISTED_PART');
 }
 return {unitCount:batch.results.length,claimResults:batch.results.filter(r=>r.claimCandidates.length).map(r=>({claimCandidates:r.claimCandidates}))};
}

export async function aggregateTextReviewStreaming({caseId,sourceVersion,root,documents,loadBatch}){
 if(!caseId||!/^[a-f0-9]{64}$/.test(sourceVersion||'')||!Array.isArray(documents)||!documents.length||typeof loadBatch!=='function')throw Error('INVALID_STREAM_AGGREGATION');
 const claims=[],coverage=[];let observationCount=0;
 for(const d of documents){
  if(!d?.id||!Number.isSafeInteger(d.pageCount)||d.pageCount<1)throw Error('INVALID_STREAM_DOCUMENT');
  for(let offset=0;offset<d.pageCount;offset+=160){
   const offsets=Array.from({length:Math.min(8,Math.ceil((d.pageCount-offset)/20))},(_,i)=>offset+i*20);
   const batches=await Promise.all(offsets.map(start=>loadBatch(root+d.id+'-'+String(start).padStart(8,'0')+'.json')));
   for(let i=0;i<offsets.length;i++){
    const start=offsets[i];
    const verified=validatePersistedBatch({batch:batches[i],documentId:d.id,sourceVersion,pageStart:start+1,pageCount:Math.min(20,d.pageCount-start)});
    observationCount+=verified.unitCount;
    for(const claim of verified.claimResults)claims.push(claim);
   }
  }
  coverage.push({documentId:d.id,pages:d.pageCount,textBatchCount:Math.ceil(d.pageCount/20)});
 }
 return {caseId,sourceVersion,coverage,observationCount,opposingStatementCandidates:detectOpposingStatements(claims),verifiedLegal:false,verifiedVisual:false,status:'awaiting_visual_and_semantic_review'};
}

export function finalizationDescriptors(documents,batchSize=20){
 if(!Array.isArray(documents)||!documents.length||!Number.isSafeInteger(batchSize)||batchSize<1)throw Error('INVALID_FINALIZATION_PLAN');
 const out=[];
 for(const d of documents){
  if(!d?.id||!Number.isSafeInteger(d.pageCount)||d.pageCount<1)throw Error('INVALID_FINALIZATION_DOCUMENT');
  for(let start=0;start<d.pageCount;start+=batchSize)out.push({documentId:d.id,start,count:Math.min(batchSize,d.pageCount-start)});
 }
 return out;
}

export function validateFinalizationPart(part,{sourceVersion,offset,batchCount,sha256}){
 if(!part||part.sourceVersion!==sourceVersion||part.offset!==offset||part.batchCount!==batchCount||!Number.isSafeInteger(part.unitCount)||part.unitCount<0||!Array.isArray(part.claims)||!/^[a-f0-9]{64}$/.test(sha256||'')||createHash('sha256').update(JSON.stringify(part)).digest('hex')!==sha256)throw Error('INVALID_FINALIZATION_PART');
 return true;
}
