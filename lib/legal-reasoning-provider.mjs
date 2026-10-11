import {sourceIndex,verifyCitedPropositions} from './case-reasoning.mjs';
const allowed=new Set(['claim','denial','admission','counterclaim','fact','inference','uncertainty']);
export function buildLegalReasoningRequest({model,caseId,units,maxOutputTokens=8000}){
 if(!model||!caseId||!Array.isArray(units)||!units.length)throw Error('INVALID_REASONING_REQUEST');
 sourceIndex(units);
 const sources=units.map(u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,text:u.text}));
 if(sources.reduce((n,u)=>n+u.text.length,0)>100000)throw Error('REASONING_BATCH_REQUIRED');
 return {model,max_output_tokens:maxOutputTokens,input:[{role:'system',content:[{type:'input_text',text:'You are a Korean legal evidence analyst. Return strictly JSON with propositions: [{id,type,statement,sources:[{documentId,page,part,hash,quote}],status}]. Only quote text literally present in the cited source. Separate claims, denials, admissions, counterclaims, facts, inferences and uncertainty. Never invent a case number, citation or precedent. If insufficient material, state uncertainty.'}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({caseId,sources})}]}]};
}
export function parseLegalReasoningOutput({units,response}){
 if(!response||response.mock===true)return {accepted:false,reason:'MOCK_OR_MISSING_PROVIDER_RESPONSE'};
 let data;
 try{data=typeof response==='string'?JSON.parse(response):response}catch{return {accepted:false,reason:'INVALID_JSON'}}
 if(!Array.isArray(data?.propositions))return {accepted:false,reason:'INVALID_PROPOSITIONS'};
 const ids=new Set();
 for(const p of data.propositions){if(!p.id||ids.has(p.id)||!allowed.has(p.type)||typeof p.statement!=='string'||!p.statement.trim()){return {accepted:false,reason:'INVALID_PROPOSITION_SCHEMA'}}ids.add(p.id)}
 const audit=verifyCitedPropositions(units,data.propositions);
 if(!audit.complete)return {accepted:false,reason:'INVALID_SOURCE_CITATION',audit};
 return {accepted:true,propositions:data.propositions.map(p=>({...p,status:'source_citation_checked_not_legally_verified'})),citationAudit:audit,semanticVerified:false};
}
