import {auditTextReviewOutputs,expectedTextReviewOutputs} from './text-review-manifest.mjs';
import {detectOpposingStatements} from './case-crosscheck.mjs';

/**
 * Deterministic aggregation of persisted text batches.
 * This is a text-only, unverified candidate report, NEVER a legal merits audit.
 */
export function aggregateTextReview({caseId,sourceVersion,root,documents,outputs}){
 if(!caseId||!/^[a-f0-9]{64}$/.test(sourceVersion||'')||!Array.isArray(documents)||!Array.isArray(outputs))throw Error('INVALID_AGGREGATION_INPUT');
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
   const unitKeys=new Set(),pageParts=new Map();
   for(const result of batch.results){
    if(result.status!=='verified'||result.documentId!==d.id||!Number.isSafeInteger(result.page)||result.page<nextPage||result.page>=nextPage+count||!Number.isSafeInteger(result.part)||result.part<0||!(/^[a-f0-9]{64}$/.test(result.hash||''))||!(/^[a-f0-9]{64}$/.test(result.textHash||'')))throw Error('INVALID_TEXT_RESULT_PROVENANCE');
    const key=result.page+':'+result.part;
    if(unitKeys.has(key))throw Error('DUPLICATE_TEXT_UNIT');
    unitKeys.add(key);
    if(!pageParts.has(result.page))pageParts.set(result.page,[]);
    pageParts.get(result.page).push(result.part);
    for(const claim of [...(result.claimCandidates||[]),...(result.observations||[])]){
     if(claim.source?.documentId!==d.id||claim.source?.page!==result.page||claim.source?.part!==result.part||claim.source?.hash!==result.hash)throw Error('INVALID_CANDIDATE_PROVENANCE');
    }
   }
   for(let page=nextPage;page<nextPage+count;page++){
    const parts=(pageParts.get(page)||[]).sort((a,b)=>a-b);
    if(!parts.length||parts.some((part,i)=>part!==i+1))throw Error('TEXT_PAGE_UNIT_COVERAGE_INCOMPLETE');
   }
   observations.push(...batch.results);
   nextPage+=count;
  }
  if(nextPage!==d.pageCount+1)throw Error('DOCUMENT_COVERAGE_INCOMPLETE');
  coverage.push({documentId:d.id,pages:d.pageCount,textBatchCount:Math.ceil(d.pageCount/20)});
 }
 const opposing=detectOpposingStatements(observations);
 return {caseId,sourceVersion,coverage,observationCount:observations.length,opposingStatementCandidates:opposing,verifiedLegal:false,verifiedVisual:false,status:'awaiting_visual_and_semantic_review'};
}
