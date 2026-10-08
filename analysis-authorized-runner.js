// Server-only paid analysis entrypoint. Do not expose directly as a public HTTP route.
// Authentication must resolve accountId from a verified server session, never request JSON.
import {createAnalysisJob} from './analysis-pipeline.js';
import {authorizeAnalysisJob} from './analysis-entitlement.js';
import {runPrivateAnalysis} from './analysis-private-runner.js';

export async function runAuthorizedAnalysis(documents,{
 session,authenticate,entitlementId,jobId,ledger,
 apiKey,model,fetchImpl,timeoutMs,input,batches,maxBatches=15
}={}){
 if(typeof authenticate!=='function')throw Error('SERVER_AUTH_REQUIRED');
 const identity=await authenticate(session);
 if(!identity||typeof identity.accountId!=='string'||!identity.accountId.trim())throw Error('UNAUTHENTICATED');
 // Validate all PDF input and batch limits before consuming a paid entitlement.
 const job=createAnalysisJob(documents,{input,batches});
 if(!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>30)throw Error('INVALID_BATCH_LIMIT');
 if(job.plan.batches.length>maxBatches)throw Error('TOO_MANY_BATCHES');
 const actualPages=job.input.documents.reduce((n,d)=>n+d.pageCount,0);
 await authorizeAnalysisJob({entitlementId,accountId:identity.accountId,jobId,actualPages,ledger});
 // Entitlement is reserved before any external model request. Production ledger
 // must also handle failed-job retry/refund transitions atomically.
 return runPrivateAnalysis(documents,{enabled:true,apiKey,model,fetchImpl,timeoutMs,input,batches,maxBatches});
}
