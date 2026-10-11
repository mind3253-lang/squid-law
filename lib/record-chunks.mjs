import {createHash} from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
export function segmentRecord({scope, documentId, pages, maxCharacters = 12000}) {
  if (!['customer', 'skynet'].includes(scope)) throw Error('INVALID_SCOPE');
  if (typeof documentId !== 'string' || !documentId) throw Error('INVALID_DOCUMENT');
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1000) throw Error('INVALID_CHUNK_SIZE');
  if (!Array.isArray(pages)) throw Error('INVALID_PAGES');
  const segments = [], seen = new Set();
  for (const page of pages) {
    const number = page?.page;
    if (!Number.isSafeInteger(number) || number < 1 || seen.has(number)) throw Error('INVALID_OR_DUPLICATE_PAGE');
    seen.add(number);
    const content = String(page.text ?? '');
    if (!content.trim()) {segments.push({scope,documentId,page:number,part:0,parts:0,text:'',status:'ocr_required',hash:digest('')});continue}
    const count=Math.ceil(content.length/maxCharacters);
    for(let i=0;i<count;i++){const text=content.slice(i*maxCharacters,(i+1)*maxCharacters);segments.push({scope,documentId,page:number,part:i+1,parts:count,text,status:'text_extracted',hash:digest(text)})}
  }
  return {segments,pages:seen.size,characters:segments.reduce((n,x)=>n+x.text.length,0),version:digest(JSON.stringify(segments.map(({page,part,hash})=>[page,part,hash])))};
}
export function auditSegments(originalPages,segments){
 if(!Array.isArray(originalPages)||!Array.isArray(segments))throw Error('INVALID_SEGMENT_AUDIT_INPUT');
 const originalSet=new Set(originalPages.map(p=>p.page));
 if(originalSet.size!==originalPages.length)return {complete:false,failures:[{reason:'duplicate_original_page'}],pageCount:originalPages.length,segmentCount:segments.length};
 if(originalPages.some(p=>!Number.isSafeInteger(p?.page)||p.page<1))return {complete:false,failures:[{reason:'invalid_original_page'}],pageCount:originalPages.length,segmentCount:segments.length};
 const grouped=new Map();for(const segment of segments){if(!segment||!Number.isSafeInteger(segment.page)||segment.page<1)return {complete:false,failures:[{reason:'invalid_segment_page'}],pageCount:originalPages.length,segmentCount:segments.length};const items=grouped.get(segment.page)||[];items.push(segment);grouped.set(segment.page,items)}
 const failures=[];for(const page of originalPages){const items=grouped.get(page.page)||[];if(!items.length){failures.push({page:page.page,reason:'missing'});continue}
 if(!String(page.text??'').trim()){if(items.length!==1||items[0].status!=='ocr_required')failures.push({page:page.page,reason:'ocr_status'})}
 else{const sorted=[...items].sort((a,b)=>a.part-b.part);if(sorted.some((x,i)=>x.part!==i+1||x.parts!==sorted.length)||sorted.map(x=>x.text).join('')!==String(page.text))failures.push({page:page.page,reason:'content_mismatch'})}}
 for(const page of grouped.keys())if(!originalSet.has(page))failures.push({page,reason:'unexpected'});
 return {complete:failures.length===0,failures,pageCount:originalPages.length,segmentCount:segments.length};
}
