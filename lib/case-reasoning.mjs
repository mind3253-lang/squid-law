import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const key=s=>[s.documentId,s.page,s.part,s.hash].join(':');
export function sourceIndex(units){
 const map=new Map();
 for(const u of units){if(!u.documentId||!Number.isSafeInteger(u.page)||u.page<1||!Number.isSafeInteger(u.part)||u.part<0||!u.hash||typeof u.text!=='string')throw Error('INVALID_SOURCE_UNIT');const id=key(u);if(map.has(id))throw Error('DUPLICATE_SOURCE_UNIT');map.set(id,u)}
 return map;
}
export function verifyCitedPropositions(units,propositions){
 const index=sourceIndex(units),failures=[],checked=[];
 for(const p of propositions){
  const references=p.sources||[];
  if(!p.id||!p.statement||!Array.isArray(references)||!references.length){failures.push({id:p.id||null,reason:'MISSING_PROPOSITION_OR_SOURCES'});continue}
  let ok=true;
  for(const s of references){const u=index.get(key(s));if(!u){failures.push({id:p.id,reason:'SOURCE_NOT_FOUND',source:s});ok=false;continue}
   if(s.quote!==undefined&&(!String(s.quote).trim()||!u.text.includes(s.quote))){failures.push({id:p.id,reason:'QUOTE_NOT_IN_SOURCE',source:s});ok=false}
  }
  if(ok)checked.push(p.id);
 }
 return {complete:failures.length===0,checked,failures,verifiedMeaning:false};
}
export function caseModel({caseId,documents,propositions}){
 if(!caseId||!Array.isArray(documents)||!Array.isArray(propositions))throw Error('INVALID_CASE_MODEL');
 const seen=new Set();
 for(const p of propositions){if(!p.id||seen.has(p.id)||!['claim','denial','admission','counterclaim','fact','inference','uncertainty'].includes(p.type)||!Array.isArray(p.sources))throw Error('INVALID_PROPOSITION');seen.add(p.id)}
 return {caseId,documents:documents.map(d=>({id:d.id,name:d.name,pageCount:d.pageCount})),propositions,verified:false,stage:'source_candidates',version:sha(JSON.stringify({caseId,documents,propositions}))};
}
export function independentCaseAudit({units,model,documentCoverage,visualCoverage,semanticAudit}){
 const citationAudit=verifyCitedPropositions(units,model.propositions);
 const missingDocuments=model.documents.filter(d=>!documentCoverage?.[d.id]?.complete).map(d=>d.id);
 const visualMissing=model.documents.filter(d=>visualCoverage?.[d.id]?.complete!==true).map(d=>d.id);
 const unresolved=model.propositions.filter(p=>p.status!=='independently_verified').map(p=>p.id);
 const semanticVerified=semanticAudit?.complete===true&&semanticAudit?.modelVersion===model.version&&semanticAudit?.reviewerIndependent===true;
 return {complete:citationAudit.complete&&missingDocuments.length===0&&visualMissing.length===0&&unresolved.length===0&&semanticVerified,citationAudit,missingDocuments,visualMissing,unresolved,semanticVerificationRequired:!semanticVerified};
}
