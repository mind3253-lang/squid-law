// Strictly check a proposed semantic comparison against its two original quotes.
// Source matching does not validate the model's interpretation.
import {verifyCitation} from './source-verification.js';
export function validateComparisonResponse(documents,lead,response){
 if(!lead||!Array.isArray(lead.sources)||lead.sources.length!==2||lead.sources.some(source=>!source||typeof source!=='object'||typeof source.document!=='string'||!source.document.trim()||!Number.isInteger(source.page)||source.page<1||typeof source.quote!=='string'||source.quote.normalize('NFKC').replace(/\s+/g,' ').trim().length<8))throw Error('INVALID_COMPARISON_LEAD');
 if(!response||typeof response!=='object'||Array.isArray(response))throw Error('INVALID_COMPARISON_RESPONSE');
 const allowed=['conflict_candidate','different_positions','insufficient_information'];
 if(!allowed.includes(response.relation)||typeof response.explanation!=='string'||!response.explanation.trim()||response.explanation.length>300||!Array.isArray(response.citations)||response.citations.length!==2)throw Error('INVALID_COMPARISON_RESPONSE');
 const checks=response.citations.map((c,i)=>{
  const source=lead.sources[i];
  if(!c||c.document!==source.document||c.page!==source.page||c.quote!==source.quote)throw Error('COMPARISON_CITATION_CHANGED');
  return verifyCitation(documents,c);
 });
 return {
  schema:'squidlaw-checked-comparison-v1',
  reference:lead.reference,
  relation:response.relation,
  explanation:response.explanation,
  citations:response.citations.map((c,i)=>({...c,verification:checks[i]})),
  sourceReady:checks.every(c=>c.status==='matched'),
  interpretationStatus:'AI 해석 후보 · 사람의 판단 필요'
 };
}
