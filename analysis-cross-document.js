// Cross-document review leads from exact shared reference numbers.
// These are co-mentions, NOT proven contradictions or the same evidence.
import {buildLocalIndex,buildEvidenceMap} from './analysis-local.js';

export function buildCrossDocumentLeads(documents,{maxLeads=80,maxPerReference=4}={}){
 if(!Array.isArray(documents)||!Number.isInteger(maxLeads)||maxLeads<1||maxLeads>500||!Number.isInteger(maxPerReference)||maxPerReference<1||maxPerReference>20)throw Error('INVALID_COMPARISON_INPUT');
 const index=buildLocalIndex(documents);
 const entries=buildEvidenceMap(index).filter(e=>e.documentCount>1);
 const leads=[];
 for(const entry of entries){
  const occurrences=entry.occurrences;
  let count=0;
  for(let i=0;i<occurrences.length&&count<maxPerReference;i++){
   for(let j=i+1;j<occurrences.length&&count<maxPerReference;j++){
    const a=occurrences[i],b=occurrences[j];
    if(a.document===b.document)continue;
    if(a.text===b.text)continue;
    leads.push({
     type:'shared-reference-review',
     reference:entry.reference,
     label:'동일 번호를 언급한 서로 다른 문서의 문장 (비교 검토 필요)',
     sources:[
      {document:a.document,page:a.page,quote:a.text},
      {document:b.document,page:b.page,quote:b.text}
     ],
     limitation:'동일 번호의 언급만 확인했습니다. 모순·사실관계·증거 동일성은 확인하지 않았습니다.'
    });
    count++;
    if(leads.length>=maxLeads)return {schema:'squidlaw-cross-document-leads-v1',leads,truncated:true};
   }
  }
 }
 return {schema:'squidlaw-cross-document-leads-v1',leads,truncated:false};
}
