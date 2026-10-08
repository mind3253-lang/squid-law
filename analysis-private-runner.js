// Private, opt-in orchestration of all PDF text batches.
// Caller is responsible for authentication, billing, privacy and rate limits.
// Never expose this function through an unauthenticated public endpoint.
import {createAnalysisJob,finishAnalysisJob} from './analysis-pipeline.js';
import {analyzeBatchWithModel} from './analysis-model-worker.js';

export async function runPrivateAnalysis(documents,{
 enabled=false,apiKey,model,fetchImpl,timeoutMs,
 input,batches,maxBatches=15,maxTotalChars=120000
}={}){
 if(!enabled)throw Error('AI_WORKER_DISABLED');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('MISSING_SERVER_API_KEY');
 if(typeof model!=='string'||!/^gpt-[a-zA-Z0-9.-]+$/.test(model))throw Error('INVALID_MODEL');
 if(!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>30)throw Error('INVALID_BATCH_LIMIT');
 if(!Number.isInteger(maxTotalChars)||maxTotalChars<1||maxTotalChars>450000)throw Error('INVALID_JOB_CHAR_LIMIT');
 // The input option is a limits object, not a prebuilt PDF input package.
 if(input!==undefined&&(!input||typeof input!=='object'||Array.isArray(input)||!Number.isInteger(input.maxPages)||input.maxPages<1||!Number.isInteger(input.maxChars)||input.maxChars<1))throw Error('INVALID_INPUT_LIMITS');
 const job=createAnalysisJob(documents,{input,batches});
 if(job.plan.batches.length>maxBatches)throw Error('TOO_MANY_BATCHES');
 if(job.input.diagnostics.totalChars>maxTotalChars)throw Error('JOB_TEXT_BUDGET_EXCEEDED');
 const responses=[];
 // Sequential requests prevent accidental concurrency spikes.
 // Stop on error rather than claiming a complete analysis.
 for(const batch of job.plan.batches){
  const payload=await analyzeBatchWithModel(batch,{enabled:true,apiKey,model,fetchImpl,timeoutMs});
  responses.push({batch:batch.batch,payload});
 }
 return finishAnalysisJob(job,responses);
}
