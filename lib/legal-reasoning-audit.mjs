const SHA=/^[a-f0-9]{64}$/;
export function auditLegalReasoningResult({request,result,sourceIndex}){
 const failures=[];
 if(!request||!result||!Array.isArray(sourceIndex)||!SHA.test(request.sourceVersion||''))return {complete:false,failures:['INVALID_AUDIT_INPUT']};
 if(request.ready!==true||request.verified!==false)failures.push('REASONING_REQUEST_NOT_AUTHORIZED');
 if(result.caseId!==request.caseId||result.sourceVersion!==request.sourceVersion)failures.push('REASONING_SOURCE_MISMATCH');
 if(!Array.isArray(result.findings)||!result.findings.length)failures.push('MISSING_REASONING_FINDINGS');
 const sources=new Map();
 for(const row of sourceIndex){
  if(!row?.documentId||!Number.isSafeInteger(row.page)||row.page<1||!Number.isSafeInteger(row.part)||row.part<1||!SHA.test(row.hash||'')){failures.push('INVALID_SOURCE_INDEX');continue}
  const key=row.documentId+':'+row.page+':'+row.part;
  if(sources.has(key))failures.push('DUPLICATE_SOURCE_INDEX');
  sources.set(key,row.hash);
 }
 for(const [i,finding] of (result.findings||[]).entries()){
  if(!finding||typeof finding.claim!=='string'||!finding.claim.trim()||!['claim','rebuttal','admission','counterclaim','legal_element','legal_conclusion'].includes(finding.type))failures.push('INVALID_FINDING:'+i);
  if(!Array.isArray(finding.sources)||!finding.sources.length){failures.push('UNCITED_FINDING:'+i);continue}
  for(const [j,ref] of finding.sources.entries()){
   const key=ref?.documentId+':'+ref?.page+':'+ref?.part;
   if(!SHA.test(ref?.hash||'')||sources.get(key)!==ref.hash)failures.push('UNVERIFIED_SOURCE:'+i+':'+j);
  }
  if(finding.status==='verified'||finding.status==='final')failures.push('PREMATURE_FINDING_VERIFICATION:'+i);
 }
 if(result.independentAuditVerified===true)failures.push('SELF_ATTESTED_INDEPENDENT_AUDIT');
 return {complete:failures.length===0,failures,verified:false,requiresIndependentSemanticAudit:true};
}
