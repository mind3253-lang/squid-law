import {sourceIndex,verifyCitedPropositions} from './case-reasoning.mjs';
export function buildIndependentAuditRequest({model,reasoningModel,caseModel,units}){
 if(!model||!reasoningModel||model===reasoningModel||!caseModel?.version||!Array.isArray(caseModel.propositions)||!Array.isArray(units))throw Error('INDEPENDENT_AUDITOR_REQUIRED');
 sourceIndex(units);
 const sources=units.map(u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,text:u.text}));
 if(sources.reduce((n,s)=>n+s.text.length,0)>100000)throw Error('AUDIT_BATCH_REQUIRED');
 return {model,max_output_tokens:8000,input:[{role:'system',content:[{type:'input_text',text:'Independently audit the legal propositions against the ORIGINAL source text, not the original model rationale. Return JSON {findings:[{propositionId,sourceSupported,semanticSupported,explanation}],missingIssues:[],complete:boolean}. Reject unsupported quotes, contrary evidence, unreviewed documents and unjustified inferences. Do not claim verification of sources you did not receive.'}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({modelVersion:caseModel.version,propositions:caseModel.propositions,sources})}]}]};
}
export function validateIndependentAudit({caseModel,units,reasoningModel,auditModel,review}){
 if(!caseModel?.version||!reasoningModel||!auditModel||reasoningModel===auditModel||review?.mock===true||!Array.isArray(review?.findings))return {complete:false,reason:'AUDITOR_NOT_INDEPENDENT'};
 const citation=verifyCitedPropositions(units,caseModel.propositions);
 if(!citation.complete)return {complete:false,reason:'SOURCE_AUDIT_FAILED',citation};
 const ids=new Set(caseModel.propositions.map(p=>p.id)),seen=new Set();
 for(const f of review.findings){if(!ids.has(f.propositionId)||seen.has(f.propositionId))return {complete:false,reason:'AUDIT_FINDING_MISMATCH'};seen.add(f.propositionId)}
 const complete=review.complete===true&&seen.size===ids.size&&review.findings.every(f=>f.sourceSupported===true&&f.semanticSupported===true)&&Array.isArray(review.missingIssues)&&review.missingIssues.length===0;
 return {complete,modelVersion:caseModel.version,reviewerIndependent:true,reviewedCount:seen.size,reason:complete?null:'UNRESOLVED_AUDIT_FINDINGS'};
}
