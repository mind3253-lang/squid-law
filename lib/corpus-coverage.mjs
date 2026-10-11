import {segmentRecord,auditSegments} from './record-chunks.mjs';
export function prepareCorpus(scope,documents){
 if(!['customer','skynet'].includes(scope))throw Error('INVALID_SCOPE');
 const units=[],summary=[],documentIds=new Set();
 for(const d of documents){
  if(!d?.id||documentIds.has(d.id)||!Array.isArray(d.pages)||d.pages.length!==d.pageCount)throw Error('INVALID_DOCUMENT_COVERAGE');
  documentIds.add(d.id);
  if(new Set(d.pages.map(p=>p.page)).size!==d.pages.length||d.pages.some(p=>!Number.isSafeInteger(p.page)||p.page<1||p.page>d.pageCount))throw Error('INVALID_PAGE_SEQUENCE');
  const result=segmentRecord({scope,documentId:d.id,pages:d.pages});
  if(!auditSegments(d.pages,result.segments).complete)throw Error('SEGMENT_AUDIT');
  units.push(...result.segments.map(s=>({...s,filename:d.name||''})));
  summary.push({id:d.id,pages:d.pageCount,units:result.segments.length,characters:result.characters,version:result.version});
 }
 return {scope,units,summary,completeTextCoverage:true,completeVisualCoverage:false};
}
export function auditAnalysis(corpus,results){
 const checked=new Set(results.filter(r=>r.status==='verified').map(r=>r.documentId+':'+r.page+':'+r.part+':'+r.hash));
 const missing=corpus.units.filter(u=>!checked.has(u.documentId+':'+u.page+':'+u.part+':'+u.hash));
 return {complete:missing.length===0&&corpus.completeVisualCoverage===true,missing:missing.map(u=>({documentId:u.documentId,page:u.page,part:u.part}))};
}
