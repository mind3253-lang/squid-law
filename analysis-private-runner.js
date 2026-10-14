// Private, opt-in orchestration of all PDF text batches.
// Caller is responsible for authentication, billing, privacy and rate limits.
// Never expose this function through an unauthenticated public endpoint.
import {createAnalysisJob,finishAnalysisJob} from './analysis-pipeline.js';
import {analyzeBatchWithModel} from './analysis-model-worker.js';

export async function runPrivateAnalysis(documents,{
 enabled=false,apiKey,model,fetchImpl,timeoutMs,
 input,batches,maxBatches=15,maxTotalChars=120000,deadlineAt
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
 const responses=new Array(job.plan.batches.length);
 // Two bounded workers avoid serial model latency without unbounded API bursts.
 let next=0,firstError=null;
 const worker=async()=>{
  while(next<job.plan.batches.length&&!firstError){
   const index=next++,batch=job.plan.batches[index];
   try{
    const remaining=deadlineAt===undefined?undefined:deadlineAt-Date.now();
    if(remaining!==undefined&&remaining<1000)throw Error('MODEL_REQUEST_TIMEOUT');
    const callTimeout=remaining===undefined?timeoutMs:Math.min(timeoutMs??45000,remaining,120000);
    const payload=await analyzeBatchWithModel(batch,{enabled:true,apiKey,model,fetchImpl,...(callTimeout===undefined?{}:{timeoutMs:Math.floor(callTimeout)})});
    responses[index]={batch:batch.batch,payload};
   }catch(error){firstError=firstError||error;}
  }
 };
 await Promise.all(Array.from({length:Math.min(2,job.plan.batches.length)},()=>worker()));
 if(firstError)throw firstError;
 return finishAnalysisJob(job,responses);
}
