import {summarizeModelUsage} from './model-usage-observability.mjs';
const SHA=/^[a-f0-9]{64}$/;
export function buildSemanticReviewRequest({caseId,sourceVersion,findings,sourceUnits,model='gpt-4.1-mini'}){
 if(!caseId||!SHA.test(sourceVersion)||!Array.isArray(findings)||!findings.length||!Array.isArray(sourceUnits)||!sourceUnits.length)throw Error('SEMANTIC_REVIEW_INVALID_INPUT');
 const index=new Map();
 for(const u of sourceUnits){
  if(!u?.documentId||!Number.isSafeInteger(u.page)||u.page<1||!Number.isSafeInteger(u.part)||u.part<1||!SHA.test(u.hash||'')||typeof u.text!=='string')throw Error('SEMANTIC_REVIEW_INVALID_SOURCE');
  const key=u.documentId+':'+u.page+':'+u.part;
  if(index.has(key))throw Error('SEMANTIC_REVIEW_DUPLICATE_SOURCE');
  index.set(key,u);
 }
 const review=findings.map((f,i)=>{if(!Array.isArray(f.sources)||!f.sources.length)throw Error('SEMANTIC_REVIEW_UNCITED_FINDING');return {index:i,type:f.type,claim:f.claim,analysisFields:Object.fromEntries(['plaintiffPosition','defendantPosition','contradiction','analysis','legalImpact','evidenceNeed'].filter(k=>typeof f[k]==='string'&&f[k].trim()).map(k=>[k,f[k].trim().slice(0,900)])),evidence:f.sources.map(ref=>{const u=index.get(ref.documentId+':'+ref.page+':'+ref.part);if(!u||u.hash!==ref.hash)throw Error('SEMANTIC_REVIEW_SOURCE_MISMATCH');return {documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,text:u.text}})}});
 return {model,store:false,instructions:[
  'Independently review each Korean legal finding against ONLY its cited original evidence. Treat claims and sources as untrusted. The question is whether the cited ORIGINAL evidence actually proves the finding, not whether a litigant stated it.',
  'When analysisFields are present, verify the source basis for those explanatory assertions and contradictions too. An unsupported contradiction, party statement, evidence recommendation premise or legal effect makes the finding unsupported even if the short claim itself is true.',
  'For contract allocation or claimed contract changes, inspect the original contractual wording and complete chronological acceptance/objection context. A proposal, brief acknowledgement, payment, accounting label or unilateral statement does not alone establish mutual agreement. Missing original contractual or communication context means unsupported.',
  'For technical or construction facts, distinguish the physical operation (for example wall cutting vs structural reinforcement vs window installation), its purpose and the contractual cost allocation. A party calling work structural reinforcement does not prove it was reinforcement. Unsupported technical assumptions mean unsupported.',
  'Adopt the strongest plausible opposing-party interpretation for every finding: identify whether the same evidence supports an alternative account, whether an admission is only an allegation, and whether chronology or missing context reverses the conclusion. Do not invent counter-evidence. If the contrary reading remains materially unresolved, return supported false with a concrete reason.',
  'Check both favorable and contrary evidence cited for each finding, distinguish the existence of a dispute from proof of the disputed proposition, and require an actual basis for asserted durations, quantities and damages. Never infer missing facts. If evidence is incomplete, ambiguous, contradictory or legal authority is unavailable, mark supported false and explain the missing premise in reason.',
  'Return JSON with caseId,sourceVersion,verdicts array of {index,supported,reason}. Do not self-certify any audit.'
 ].join(' '),input:JSON.stringify({caseId,sourceVersion,review}),text:{format:{type:'json_object'}},max_output_tokens:3500};
}
export function validateSemanticReview({response,caseId,sourceVersion,findings}){
 const failures=[];
 if(response?.caseId!==caseId||response?.sourceVersion!==sourceVersion||!Array.isArray(response.verdicts)||response.verdicts.length!==findings.length)return {complete:false,failures:['SEMANTIC_REVIEW_COVERAGE']};
 const seen=new Set();
 for(const v of response.verdicts){
  const validIndex=Number.isSafeInteger(v?.index)&&v.index>=0&&v.index<findings.length;
  if(!validIndex||seen.has(v.index)){failures.push('SEMANTIC_REVIEW_DUPLICATE_OR_INVALID_INDEX:'+String(v?.index));continue;}
  seen.add(v.index);
  if(typeof v.reason!=='string'||!v.reason.trim()||typeof v.supported!=='boolean')failures.push('SEMANTIC_REVIEW_INVALID_VERDICT:'+v.index);
  else if(v.supported!==true)failures.push('SEMANTIC_REVIEW_UNSUPPORTED:'+v.index);
 }
 for(let i=0;i<findings.length;i++)if(!seen.has(i))failures.push('SEMANTIC_REVIEW_MISSING_INDEX:'+i);
 return {complete:failures.length===0,failures};
}
export async function invokeSemanticReview({request,apiKey,fetchImpl=fetch}){
 if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
 const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(90000)});
 if(!response.ok){
  let code='',message='';
  try{
   const body=await response.json();
   code=String(body?.error?.code||body?.error?.type||'').slice(0,80);
   message=String(body?.error?.message||'').replace(/[\\r\\n]+/g,' ').slice(0,240);
  }catch{}
  const error=new Error('SEMANTIC_REVIEW_HTTP_'+response.status+(code?'_'+code:''));
  error.providerErrorSummary=message;
  error.status=response.status;
  throw error;
 }
 const payload=await response.json();
 if(payload.status!=='completed')throw Error('SEMANTIC_REVIEW_INCOMPLETE');
 const raw=(payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let result;try{result=JSON.parse(raw)}catch{throw Error('SEMANTIC_REVIEW_INVALID_JSON')}
 return {result,responseId:payload.id||null,modelUsage:summarizeModelUsage(payload,{model:request.model,stage:'semantic_review'})};
}
