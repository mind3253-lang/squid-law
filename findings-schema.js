// Strict validation for structured analysis findings before showing or verifying them.
// This checks data shape, not factual or legal correctness.
export function validateFindingsPayload(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.schema!=='squidlaw-findings-v1'||!Array.isArray(payload.findings)||payload.findings.length>200)throw Error('INVALID_FINDINGS_SCHEMA');
 const findings=payload.findings.map(f=>{
  if(!f||typeof f!=='object'||typeof f.title!=='string'||!f.title.trim()||f.title.length>250||!Array.isArray(f.citations)||f.citations.length>20)throw Error('INVALID_FINDING');
  const citations=f.citations.map(c=>{
   if(!c||typeof c!=='object'||typeof c.document!=='string'||!c.document.trim()||c.document.length>300||!Number.isInteger(c.page)||c.page<1||typeof c.quote!=='string'||c.quote.length<8||c.quote.length>1500)throw Error('INVALID_CITATION');
   return {document:c.document,page:c.page,quote:c.quote};
  });
  return {title:f.title,citations};
 });
 return {schema:'squidlaw-findings-v1',findings};
}
