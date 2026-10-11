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
   observations.push(...batch.results);
   nextPage+=count;
  }
  if(nextPage!==d.pageCount+1)throw Error('DOCUMENT_COVERAGE_INCOMPLETE');
  coverage.push({documentId:d.id,pages:d.pageCount,textBatchCount:Math.ceil(d.pageCount/20)});
 }
 const opposing=detectOpposingStatements(observations);
 return {caseId,sourceVersion,coverage,observationCount:observations.length,opposingStatementCandidates:opposing,verifiedLegal:false,verifiedVisual:false,status:'awaiting_visual_and_semantic_review'};
}
