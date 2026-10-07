// Split prepared analysis input into page-preserving batches for future AI workers.
// No network requests. Never silently truncate a source page.
export function batchAnalysisInput(input,{maxBatchChars=30000,maxBatchPages=20}={}){
 if(!input||input.schema!=='squidlaw-analysis-input-v1'||!Array.isArray(input.pages))throw Error('INVALID_ANALYSIS_INPUT');
 if(!Number.isInteger(maxBatchChars)||maxBatchChars<1||!Number.isInteger(maxBatchPages)||maxBatchPages<1)throw Error('INVALID_BATCH_LIMITS');
 const batches=[];let current=[],chars=0;
 const flush=()=>{
  if(!current.length)return;
  batches.push({schema:'squidlaw-analysis-batch-v1',batch:batches.length+1,pages:current,characterCount:chars});
  current=[];chars=0;
 };
 for(const p of input.pages){
  if(!p||typeof p.document!=='string'||!Number.isInteger(p.page)||p.page<1||typeof p.text!=='string'||!p.text)throw Error('INVALID_SOURCE_PAGE');
  if(p.text.length>maxBatchChars)throw Error('SOURCE_PAGE_TOO_LARGE');
  if(current.length>=maxBatchPages||chars+p.text.length>maxBatchChars)flush();
  current.push({document:p.document,page:p.page,text:p.text});
  chars+=p.text.length;
 }
 flush();
 return {schema:'squidlaw-analysis-batches-v1',batches,totalPages:input.pages.length,unreadablePages:input.diagnostics?.unreadablePages??0};
}
