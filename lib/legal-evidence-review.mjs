import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function extractObservations(unit){
 const out=[];for(const [i,line] of unit.text.split(/\n|(?<=[.!?。])\s+/).entries()){
  const s=line.trim();if(s.length<8)continue;
  const dates=[...s.matchAll(/(?:19|20)\d{2}[.\-/]\s*(?:0?[1-9]|1[0-2])[.\-/]\s*(?:0?[1-9]|[12]\d|3[01])/g)].map(m=>m[0]);
  const amounts=[...s.matchAll(/\d[\d,]*(?:\.\d+)?\s*(?:억\s*)?(?:만\s*)?원/g)].map(m=>m[0]);
  if(!dates.length&&!amounts.length)continue;
  out.push({id:sha(unit.hash+':'+i+':'+s),text:s,dates,amounts,source:{documentId:unit.documentId,page:unit.page,part:unit.part,hash:unit.hash},status:'unverified_observation'});
 }return out;
}
export function analyzeUnit(unit){
 if(unit.status==='ocr_required')return {status:'blocked',reason:'OCR_REQUIRED',documentId:unit.documentId,page:unit.page,part:unit.part,hash:unit.hash};
 return {status:'verified',documentId:unit.documentId,page:unit.page,part:unit.part,hash:unit.hash,textHash:sha(unit.text),observations:extractObservations(unit)};
}
export function independentlyVerify(units,results){
 const indexed=new Map(results.map(r=>[r.documentId+':'+r.page+':'+r.part,r]));const missing=[];
 for(const u of units){const r=indexed.get(u.documentId+':'+u.page+':'+u.part);if(!r||r.status!=='verified'||r.hash!==u.hash||r.textHash!==sha(u.text))missing.push({documentId:u.documentId,page:u.page,part:u.part,reason:r?.reason||'UNVERIFIED'});}
 return {complete:missing.length===0,missing};
}

export function crosscheckObservations(results){
 const rows=results.flatMap(r=>r.observations||[]),conflicts=[],seen=new Set();
 const byDate=new Map(),byAmount=new Map();
 for(const row of rows){
  for(const date of row.dates||[]){if(!byDate.has(date))byDate.set(date,[]);byDate.get(date).push(row)}
  for(const amount of row.amounts||[]){if(!byAmount.has(amount))byAmount.set(amount,[]);byAmount.get(amount).push(row)}
 }
 for(const [kind,groups] of [['same_date',byDate],['same_amount',byAmount]]){
  for(const [value,matches] of groups){
   const docs=new Set(matches.map(x=>x.source.documentId));
   if(docs.size<2)continue;
   const references=[...new Map(matches.map(x=>[x.source.documentId+':'+x.source.page+':'+x.source.part,x.source])).values()];
   const key=kind+':'+value;if(seen.has(key))continue;seen.add(key);
   conflicts.push({type:'cross_document_match',kind,value,references,status:'related_evidence_candidate_not_proof_of_same_event'});
  }
 }
 return conflicts;
}
