/** Legal authority references in supplied documents are claims, not independently verified law. */
export function auditLegalAuthorities(findings){
 const issues=[],references=[];
 const rx=/(?:대법원|고등법원|지방법원|헌법재판소|법원)?\s*(?:19|20)\d{2}(?:다|도|두|마|카|가단|가합|나|노|헌바|헌마)\d+|(?:민법|민사소송법|형법|상법|형사소송법|주택임대차보호법|상가건물\s*임대차보호법)\s*제\s*\d+\s*조(?:의\s*\d+)?/g;
 for(const [i,f] of (findings||[]).entries()){
  const fields=['claim','analysis','legalImpact'];
  for(const field of fields){
   const value=typeof f?.[field]==='string'?f[field]:'';
   for(const match of value.matchAll(rx)){
    const ref=match[0].trim();
    const verified=f?.authorityVerification?.[ref];
    const externallyChecked=verified?.verified===true&&typeof verified?.sourceUrl==='string'&&/^https:\/\//.test(verified.sourceUrl);
    references.push({findingIndex:i,field,reference:ref,externallyChecked});
    if(!externallyChecked)issues.push('LEGAL_AUTHORITY_UNVERIFIED:'+i+':'+ref);
   }
  }
 }
 return {complete:issues.length===0,issues,references};
}
