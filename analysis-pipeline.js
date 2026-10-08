// Assemble the source-preparation and result-checking stages.
// This does not call a model, upload files, or enable public analysis.
import {prepareAnalysisInput} from './analysis-input.js';
import {batchAnalysisInput} from './analysis-batches.js';
import {validateBatchFindings} from './analysis-batch-results.js';
import {mergeCheckedBatches} from './analysis-merge.js';

export function createAnalysisJob(documents,options={}){
 const input=prepareAnalysisInput(documents,options.input);
 const plan=batchAnalysisInput(input,options.batches);
 return {input,plan};
}
export function finishAnalysisJob(job,responses){
 if(!job||!job.plan||!Array.isArray(job.plan.batches))throw Error('INVALID_ANALYSIS_JOB');
 if(!Array.isArray(responses))throw Error('INVALID_RESPONSES');
 const seen=new Set(),checked=[];
 for(const response of responses){
  if(!response||!Number.isInteger(response.batch))throw Error('INVALID_RESPONSE');
  if(seen.has(response.batch))throw Error('DUPLICATE_BATCH_RESPONSE');
  seen.add(response.batch);
  const batch=job.plan.batches.find(b=>b.batch===response.batch);
  if(!batch)throw Error('UNKNOWN_BATCH_RESPONSE');
  checked.push(validateBatchFindings(batch,response.payload));
 }
 const merged=mergeCheckedBatches(job.plan,checked);
 return {...merged,diagnostics:{...merged.diagnostics,unreadablePages:job.input.diagnostics.unreadablePages}};
}
