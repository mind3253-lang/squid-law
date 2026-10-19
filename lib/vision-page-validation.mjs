// Validate provider page indexes before mapping PDF-window pages to source pages.
// Strict coverage: never guess, renumber, or silently drop evidence.
export function normalizeVisionPageNumber(value){
 if(typeof value==='string'&&/^[1-9][0-9]*$/.test(value))return Number(value);
 return value;
}
export function validateVisionWindowPages(parsed,{pageOffset=0,windowPageCount=null}={}){
 if(!parsed||!Array.isArray(parsed.pageObservations)||!Array.isArray(parsed.unreviewedPages))throw Error('VISION_PDF_INVALID_SCHEMA');
 if(!Number.isSafeInteger(pageOffset)||pageOffset<0)throw Error('VISION_PAGE_OFFSET_INVALID');
 if(windowPageCount!==null&&(!Number.isSafeInteger(windowPageCount)||windowPageCount<1))throw Error('VISION_WINDOW_PAGE_COUNT_INVALID');
 const observations=parsed.pageObservations.map(p=>({...p,page:normalizeVisionPageNumber(p?.page)}));
 const unreviewed=parsed.unreviewedPages.map(normalizeVisionPageNumber);
 const valid=n=>Number.isSafeInteger(n)&&n>=1&&(windowPageCount===null||n<=windowPageCount);
 const invalidPage=(reason,index)=>Object.assign(new Error('VISION_PDF_INVALID_PAGE'),{
  code:'VISION_PDF_INVALID_PAGE',reason,index,windowPageCount,pageOffset});
 for(let i=0;i<observations.length;i++){
  const p=observations[i];
  if(!valid(p.page))throw invalidPage('page_number_out_of_window',i);
  if(!Array.isArray(p.visualFacts)||typeof p.observedText!=='string'||!Array.isArray(p.uncertainties))throw invalidPage('observation_schema_invalid',i);
 }
 if(unreviewed.some(p=>!valid(p)))throw Error('VISION_PDF_INVALID_UNREVIEWED_PAGE');
 const pages=observations.map(p=>p.page);
 if(new Set(pages).size!==pages.length)throw Error('VISION_PDF_DUPLICATE_PAGE');
 if(unreviewed.some(p=>pages.includes(p)))throw Error('VISION_PDF_CONFLICTING_PAGE_STATUS');
 if(windowPageCount!==null){
  const covered=new Set([...pages,...unreviewed]);
  if(covered.size!==windowPageCount)throw Object.assign(new Error('VISION_PDF_INCOMPLETE_PAGE_COVERAGE'),{
   missingLocalPages:Array.from({length:windowPageCount},(_,i)=>i+1).filter(n=>!covered.has(n)),
   windowPageCount,pageOffset});
 }
 return {...parsed,pageObservations:observations.map(p=>({...p,page:p.page+pageOffset})),unreviewedPages:unreviewed.map(p=>p+pageOffset)};
}
