import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
export function auditVerifiedTextPages({documents,verifiedBatches}){
 const failures=[],pages=new Map();
 for(const d of documents)pages.set(d.id,new Map());
 for(const batch of verifiedBatches){
  const doc=pages.get(batch?.documentId);
  if(!doc||!Array.isArray(batch.pages)||!batch.sourcePdfSha256){failures.push('INVALID_VERIFIED_BATCH');continue}
  const expected=documents.find(d=>d.id===batch.documentId);
  if(expected.sha256!==batch.sourcePdfSha256){failures.push('PDF_DIGEST_MISMATCH:'+batch.documentId);continue}
  for(const p of batch.pages){
   if(!Number.isSafeInteger(p.page)||p.page<1||p.page>expected.pageCount||doc.has(p.page)||p.textSha256!==sha(p.text??''))failures.push('INVALID_VERIFIED_PAGE:'+batch.documentId+':'+p.page);
   else doc.set(p.page,p);
  }
 }
 for(const d of documents){
  const doc=pages.get(d.id);
  for(let page=1;page<=d.pageCount;page++){
   const p=doc.get(page);
   if(!p)failures.push('MISSING_VERIFIED_PAGE:'+d.id+':'+page);
   else if(!String(p.text||'').trim())failures.push('OCR_REQUIRED:'+d.id+':'+page);
  }
 }
 return {verified:failures.length===0,failures,verifiedPageCount:[...pages.values()].reduce((n,x)=>n+x.size,0)};
}
export function auditDocumentBoundaryEvidence({documents,aggregate}){
 const failures=[];
 const boundaries=aggregate?.documentBoundaryCandidates;
 if(!Array.isArray(boundaries)||boundaries.length!==documents.length)return {verified:false,failures:['DOCUMENT_BOUNDARY_COVERAGE_MISSING']};
 for(const d of documents){
  const result=boundaries.find(x=>x.documentId===d.id);
  if(!result||result.coveredPages!==d.pageCount||!Array.isArray(result.sections)){failures.push('BOUNDARY_PAGE_COVERAGE:'+d.id);continue}
  if(result.sections.some(s=>s.classification==='미검증 후보'||s.kind==='미분류'))failures.push('BOUNDARY_CLASSIFICATION_UNVERIFIED:'+d.id);
 }
 return {verified:failures.length===0,failures};
}
