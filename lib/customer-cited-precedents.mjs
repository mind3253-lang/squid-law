// Inventory only case citations appearing in verified customer-submitted PDF text.
// This is not legal authority verification: reported holdings are checked later.
const CASE_NUMBER=/(?:(대법원|헌법재판소|[가-힣]{2,16}법원)\s*)?((?:19|20)\d{2})\s*([가-힣]{1,5})\s*(\d{2,9})/g;
const BEFORE_CITATION=/(?:판례|판결|판시|선고|인용|참조|법리|전원합의체)[^0-9]{0,45}$/;
const AFTER_CITATION=/^\s*(?:판결|결정|선고|판시)/;

export function extractCitedPrecedentsFromPages(pages){
 if(!Array.isArray(pages))throw Error('CITED_PRECEDENT_PAGES_INVALID');
 const found=new Map();
 for(const row of pages){
  if(!row?.documentId||!Number.isSafeInteger(row.page)||row.page<1||typeof row.text!=='string')
   throw Error('CITED_PRECEDENT_PAGE_INVALID');
  const text=row.text;
  CASE_NUMBER.lastIndex=0;
  for(const match of text.matchAll(CASE_NUMBER)){
   const start=match.index,end=start+match[0].length;
   const context=text.slice(Math.max(0,start-110),Math.min(text.length,end+170)).replace(/\s+/g,' ').trim();
   // Bare lawsuit docket numbers are not automatically cited judicial precedents.
   const before=text.slice(Math.max(0,start-90),start),after=text.slice(end,end+22);
   if(!match[1]&&!BEFORE_CITATION.test(before)&&!AFTER_CITATION.test(after))continue;
   const caseNumber=match[2]+match[3]+match[4];
   const key=row.documentId+':'+row.page+':'+caseNumber;
   if(!found.has(key))found.set(key,{caseNumber,court:match[1]||'',
    documentId:row.documentId,page:row.page,citationContext:context.slice(0,310)});
  }
 }
 return [...found.values()];
}

export async function collectCitedPrecedents({documents,loadBatch}){
 if(!Array.isArray(documents)||typeof loadBatch!=='function')throw Error('CITED_PRECEDENT_INPUT_INVALID');
 const found=new Map();
 for(const doc of documents){
  if(!doc?.id||!doc.sha256||!Number.isSafeInteger(doc.pageCount)||doc.pageCount<1)throw Error('CITED_PRECEDENT_DOCUMENT_INVALID');
  for(let start=0;start<doc.pageCount;start+=20){
   const batch=await loadBatch(doc,start);
   const count=Math.min(20,doc.pageCount-start);
   if(!batch||batch.documentId!==doc.id||batch.sourcePdfSha256!==doc.sha256||
    !Array.isArray(batch.pages)||batch.pages.length!==count)throw Error('CITED_PRECEDENT_VERIFIED_BATCH_MISSING');
   const pages=batch.pages.map(p=>({documentId:doc.id,page:p.page,text:p.text}));
   const expected=new Set(Array.from({length:count},(_,i)=>start+i+1));
   for(const page of pages)if(!expected.delete(page.page))throw Error('CITED_PRECEDENT_PAGE_COVERAGE_FAILED');
   if(expected.size)throw Error('CITED_PRECEDENT_PAGE_COVERAGE_FAILED');
   for(const c of extractCitedPrecedentsFromPages(pages))found.set(c.documentId+':'+c.page+':'+c.caseNumber,c);
  }
 }
 return [...found.values()];
}
