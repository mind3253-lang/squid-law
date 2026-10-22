import {summarizeModelUsage} from './model-usage-observability.mjs';
const VALID=new Set(['소장','답변서','준비서면','판결문','결정문','이의신청서','지급명령신청서','변론조서','증거자료','기타']);
export function boundaryReviewRequest({documentId,sourcePdfSha256,pageCount,candidates,pageEvidence,model='gpt-4.1-mini',auditOf=null}){
 if(!documentId||!/^[a-f0-9]{64}$/.test(sourcePdfSha256)||!Number.isSafeInteger(pageCount)||pageCount<1||!Array.isArray(pageEvidence)||pageEvidence.length!==pageCount)throw Error('BOUNDARY_REQUEST_INVALID');
 return {model,store:false,instructions:'Classify legal-document boundaries from the supplied original page excerpts and visual observations. Candidate labels are untrusted. Return JSON {documentId,sourcePdfSha256,sections:[{kind,startPage,endPage,evidencePage,reason}],unreviewedPages:[]}. Sections must partition all pages contiguously without gaps, evidencePage must be within its section. Use kind from: '+[...VALID].join(',')+'. Use 기타 when ambiguous; never invent missing pages.',input:JSON.stringify({documentId,sourcePdfSha256,pageCount,candidates,pageEvidence,auditOf:auditOf?.sections||null}),text:{format:{type:'json_schema',name:'document_boundary_review',strict:true,schema:{type:'object',additionalProperties:false,required:['documentId','sourcePdfSha256','sections','unreviewedPages'],properties:{documentId:{type:'string'},sourcePdfSha256:{type:'string'},sections:{type:'array',items:{type:'object',additionalProperties:false,required:['kind','startPage','endPage','evidencePage','reason'],properties:{kind:{type:'string',enum:[...VALID]},startPage:{type:'integer'},endPage:{type:'integer'},evidencePage:{type:'integer'},reason:{type:'string'}}}},unreviewedPages:{type:'array',items:{type:'integer'}}}}}},max_output_tokens:3500};
}
export function auditBoundaryReview({result,documentId,sourcePdfSha256,pageCount}){
 const failures=[];
 if(result?.documentId!==documentId||result?.sourcePdfSha256!==sourcePdfSha256||!Array.isArray(result.sections)||!result.sections.length||!Array.isArray(result.unreviewedPages)||result.unreviewedPages.length)failures.push('BOUNDARY_RESPONSE_INVALID');
 let next=1;
 for(const section of result?.sections||[]){
  if(!section||!VALID.has(section.kind)||!Number.isSafeInteger(section.startPage)||section.startPage!==next||!Number.isSafeInteger(section.endPage)||section.endPage<next||section.endPage>pageCount||!Number.isSafeInteger(section.evidencePage)||section.evidencePage<section.startPage||section.evidencePage>section.endPage||typeof section.reason!=='string'||!section.reason.trim())failures.push('BOUNDARY_SECTION_INVALID');
  if(!Number.isSafeInteger(section?.endPage))break;
  next=section.endPage+1;
 }
 if(next!==pageCount+1)failures.push('BOUNDARY_COVERAGE_INCOMPLETE');
 return {complete:failures.length===0,failures};
}
export function compareBoundaryReviews({primary,independent,documentId,sourcePdfSha256,pageCount}){
 const a=auditBoundaryReview({result:primary,documentId,sourcePdfSha256,pageCount});
 const b=auditBoundaryReview({result:independent,documentId,sourcePdfSha256,pageCount});
 const failures=[...a.failures,...b.failures];
 if(a.complete&&b.complete){
  if(primary.sections.length!==independent.sections.length)failures.push('BOUNDARY_SECTION_COUNT_MISMATCH');
  else for(let i=0;i<primary.sections.length;i++){
   const x=primary.sections[i],y=independent.sections[i];
   if(x.kind!==y.kind||x.startPage!==y.startPage||x.endPage!==y.endPage||x.evidencePage!==y.evidencePage)failures.push('BOUNDARY_INDEPENDENT_MISMATCH:'+i);
  }
 }
 return {complete:failures.length===0,failures,documentId,sourcePdfSha256,sections:failures.length?[]:primary.sections,verified:failures.length===0,coveredPages:pageCount};
}
export async function invokeBoundaryReview({request,apiKey,fetchImpl=fetch}){
 if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
 const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('BOUNDARY_API_'+response.status);
 const payload=await response.json();
 if(payload.status!=='completed')throw Error('BOUNDARY_API_INCOMPLETE');
 const raw=(payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let result;try{result=JSON.parse(raw)}catch{throw Error('BOUNDARY_INVALID_JSON')}
 return {...result,modelUsage:summarizeModelUsage(payload,{model:request.model,stage:'boundary_review'}),providerResponseId:payload.id||null};
}
