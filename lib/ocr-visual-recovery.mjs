import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
export function reconcileVisualOcr({pages,primary,independent,sourcePdfSha256}){
 if(primary?.sourcePdfSha256!==sourcePdfSha256||independent?.sourcePdfSha256!==sourcePdfSha256||independent?.auditPass!==true)throw Error('OCR_SOURCE_MISMATCH');
 const a=new Map(primary.observations?.pageObservations?.map(p=>[p.page,p])||[]);
 const b=new Map(independent.observations?.pageObservations?.map(p=>[p.page,p])||[]);
 if(a.size!==primary.observations?.pageObservations?.length||b.size!==independent.observations?.pageObservations?.length)throw Error('OCR_DUPLICATE_PAGE');
 if(!Array.isArray(pages)||!pages.length||pages.some(p=>!Number.isSafeInteger(p?.page)||p.page<1)||new Set(pages.map(p=>p.page)).size!==pages.length)throw Error('OCR_INVALID_PAGE_MANIFEST');
 if(a.size!==pages.length||b.size!==pages.length||pages.some(p=>!a.has(p.page)||!b.has(p.page)))throw Error('OCR_PAGE_COVERAGE_MISMATCH');
 const recovered=[];
 for(const page of pages){
  const first=a.get(page.page),second=b.get(page.page);
  if(!first||!second||first.uncertainties?.length||second.uncertainties?.length)throw Error('OCR_PAGE_UNVERIFIED:'+page.page);
  const text=String(page.text||'');
  if(text.trim()){
   if(page.textSha256&&page.textSha256!==hash(text))throw Error('OCR_ORIGINAL_TEXT_DIGEST_MISMATCH:'+page.page);
   recovered.push({...page});continue;
  }
  if(Number(page.imageOperatorCount)===0){recovered.push({...page});continue}
  const observed=String(first.observedText||'').trim();
  if(!observed||observed!==String(second.observedText||'').trim())throw Error('OCR_INDEPENDENT_TEXT_MISMATCH:'+page.page);
  recovered.push({...page,text:observed,textSha256:hash(observed),ocrRecovered:true,ocrSourcePdfSha256:sourcePdfSha256,ocrVerified:true});
 }
 return {pages:recovered,verified:true,sourcePdfSha256};
}
