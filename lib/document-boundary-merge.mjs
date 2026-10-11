export function mergeBoundaryCandidates(batches){
 if(!Array.isArray(batches))throw Error('INVALID_BOUNDARY_BATCHES');
 const all=[];
 for(const b of batches){if(!b||!Array.isArray(b.sections))throw Error('INVALID_BOUNDARY_BATCH');for(const s of b.sections){if(!s.documentId||!Number.isSafeInteger(s.startPage)||!Number.isSafeInteger(s.endPage)||s.startPage>s.endPage||!Array.isArray(s.pages))throw Error('INVALID_BOUNDARY_SECTION');all.push({...s,pages:[...s.pages]})}}
 all.sort((a,b)=>a.documentId.localeCompare(b.documentId)||a.startPage-b.startPage);
 const merged=[];
 for(const s of all){
  const prev=merged.at(-1);
  if(prev&&prev.documentId===s.documentId&&s.startPage<=prev.endPage)throw Error('OVERLAPPING_BOUNDARY_CANDIDATES');
  if(prev&&prev.documentId===s.documentId&&prev.endPage+1===s.startPage&&prev.kind===s.kind&&prev.classification===s.classification){prev.endPage=s.endPage;prev.pages.push(...s.pages)}
  else merged.push(s);
 }
 for(const s of merged){if(s.pages.length!==s.endPage-s.startPage+1||s.pages.some((p,i)=>p!==s.startPage+i))throw Error('BOUNDARY_PAGE_GAP')}
 return {sections:merged,coveredPages:merged.reduce((n,s)=>n+s.pages.length,0),verified:false};
}
