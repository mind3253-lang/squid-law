import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function auditVisualProviderCoverage({documentId,sourcePdfSha256,pageCount,providerResult,extractedPages}){
 const failures=[];
 if(providerResult?.documentId!==documentId||providerResult?.sourcePdfSha256!==sourcePdfSha256)failures.push('SOURCE_MISMATCH');
 if(!Number.isSafeInteger(pageCount)||pageCount<1)failures.push('INVALID_PAGE_COUNT');
 const observations=providerResult?.observations?.pageObservations,unreviewed=providerResult?.observations?.unreviewedPages;
 if(!Array.isArray(observations)||!Array.isArray(unreviewed))return {complete:false,failures:['INVALID_PROVIDER_OUTPUT']};
 const seen=new Set();
 for(const item of observations){
  if(!Number.isSafeInteger(item?.page)||item.page<1||item.page>pageCount||seen.has(item.page)||typeof item.observedText!=='string'||!Array.isArray(item.visualFacts)||!Array.isArray(item.uncertainties))failures.push('INVALID_REVIEWED_PAGE');
  seen.add(item.page);
 }
 for(const page of unreviewed){if(!Number.isSafeInteger(page)||page<1||page>pageCount||seen.has(page))failures.push('INVALID_UNREVIEWED_PAGE');seen.add(page)}
 if(seen.size!==pageCount)failures.push('PAGE_COVERAGE_INCOMPLETE');
 if(unreviewed.length)failures.push('PAGES_UNREVIEWED');
 if(!Array.isArray(extractedPages)||extractedPages.length!==pageCount)failures.push('EXTRACTION_COVERAGE_INCOMPLETE');
 else for(let i=0;i<pageCount;i++){
  const p=extractedPages[i];
  if(p?.page!==i+1||p.textSha256!==sha(String(p.text??'')))failures.push('EXTRACTION_SOURCE_MISMATCH:'+String(i+1));
  if(p?.imageOperatorCount===null||p?.visualInventoryStatus==='operator_scan_failed')failures.push('VISUAL_INVENTORY_UNVERIFIED:'+String(i+1));
 }
 return {complete:failures.length===0,failures,documentId,sourcePdfSha256,pageCount,independentSemanticVerification:false};
}

export function compareIndependentVisualPass({primary,secondary,pageCount}){
 const failures=[];
 if(!primary||!secondary||primary.documentId!==secondary.documentId||primary.sourcePdfSha256!==secondary.sourcePdfSha256||secondary.auditPass!==true)failures.push('INDEPENDENT_SOURCE_MISMATCH');
 const a=primary?.observations?.pageObservations,b=secondary?.observations?.pageObservations;
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==pageCount||b.length!==pageCount||primary.observations.unreviewedPages?.length||secondary.observations.unreviewedPages?.length)failures.push('INDEPENDENT_PAGE_COVERAGE');
 else{
  const first=new Map(a.map(p=>[p.page,p]));
  for(const p of b){
   const original=first.get(p.page);
   if(!original||!Number.isSafeInteger(p.page)||p.page<1||p.page>pageCount||typeof p.observedText!=='string'||!Array.isArray(p.visualFacts))failures.push('INDEPENDENT_INVALID_PAGE:'+p.page);
   else if(original.observedText.trim()!==p.observedText.trim())failures.push('INDEPENDENT_TEXT_DIFFERENCE:'+p.page);
  }
 }
 return {complete:failures.length===0,failures,sourcePdfSha256:primary?.sourcePdfSha256,independentPassResponseId:secondary?.providerResponseId||null};
}
