// Verify batch analysis findings against ONLY the pages supplied to that batch.
// Prevents a model from citing an unrelated PDF page not included in its input.
import {verifyFindings} from './source-verification.js';
import {validateFindingsPayload} from './findings-schema.js';
import {summarizeCitationChecks} from './analysis-quality.js';
export function validateBatchFindings(batch,payload){
 if(!batch||batch.schema!=='squidlaw-analysis-batch-v1'||!Number.isInteger(batch.batch)||batch.batch<1||!Array.isArray(batch.pages)||!batch.pages.length||batch.pages.some(p=>!p||typeof p!=='object'||typeof p.document!=='string'||!p.document.trim()||!Number.isInteger(p.page)||p.page<1||typeof p.text!=='string'||!p.text.trim()))throw Error('INVALID_BATCH');
 const pageKeys=batch.pages.map(p=>JSON.stringify([p.document,p.page]));
 if(new Set(pageKeys).size!==pageKeys.length)throw Error('DUPLICATE_BATCH_PAGE');
 const validated=validateFindingsPayload(payload);
 const allowed=new Set(batch.pages.map(p=>JSON.stringify([p.document,p.page])));
 const docs=new Map();
 for(const p of batch.pages){
  if(!docs.has(p.document))docs.set(p.document,{name:p.document,pages:[]});
  docs.get(p.document).pages[p.page-1]={text:p.text};
 }
 const checked=verifyFindings([...docs.values()],validated.findings);
 for(const finding of checked)for(const citation of finding.citationChecks){
  if(!allowed.has(JSON.stringify([citation.document,citation.page])))
   citation.verification={status:'outside_batch',reason:'이 분석 묶음에 포함되지 않은 페이지 인용'};
 }
 const quality=summarizeCitationChecks(checked);
 return {schema:'squidlaw-checked-batch-v1',batch:batch.batch,findings:checked,quality,sourceReady:quality.findings>0&&quality.needsReviewFindings===0};
}
