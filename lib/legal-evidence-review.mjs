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
