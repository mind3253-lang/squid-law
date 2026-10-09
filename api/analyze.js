import {timingSafeEqual} from 'node:crypto';
import {runPrivateCaseReport} from '../analysis-private-case-runner.js';
import {createAnalysisJob} from '../analysis-pipeline.js';
import {createBatchModelRequest} from '../analysis-model-prompt.js';
import {buildVerifiedComparisonReport} from '../analysis-comparison-report.js';
import {createComparisonModelRequest} from '../analysis-comparison-prompt.js';

// Operator-only trial. Never publish the token or API key in frontend code.
function equals(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 if(process.env.SQUIDLAW_AI_TEST_ENABLED!=='true')return res.status(503).json({error:'AI_TEST_DISABLED'});
 const token=process.env.SQUIDLAW_AI_TEST_TOKEN;
 if(!token||token.length<24)return res.status(503).json({error:'TEST_TOKEN_NOT_CONFIGURED'});
 if(!equals(req.headers?.['x-squidlaw-test-token'],token))return res.status(401).json({error:'UNAUTHORIZED'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'MODEL_KEY_NOT_CONFIGURED'});
 const rawLength=req.headers?.['content-length'];
 const declaredLength=rawLength===undefined?0:Number(rawLength);
 if(!Number.isSafeInteger(declaredLength)||declaredLength<0||declaredLength>160000)return res.status(413).json({error:'REQUEST_TOO_LARGE'});
 let bodySize;
 try{bodySize=Buffer.byteLength(JSON.stringify(req.body??null),'utf8');}
 catch{return res.status(400).json({error:'INVALID_REQUEST_BODY'});}
 if(bodySize>160000)return res.status(413).json({error:'REQUEST_TOO_LARGE'});
 if(req.body?.consent!==true)return res.status(400).json({error:'EXTERNAL_AI_CONSENT_REQUIRED'});
 try{
  const documents=req.body?.documents;
  if(!Array.isArray(documents)||documents.length<1||documents.length>5)return res.status(422).json({error:'INVALID_DOCUMENT_COUNT'});
  // Reject jobs that cannot fit model batch constraints before any paid request.
  const job=createAnalysisJob(documents,{input:{maxPages:30,maxChars:60000}});
  if(job.plan.batches.length>8)return res.status(422).json({error:'TOO_MANY_BATCHES'});
  for(const batch of job.plan.batches)createBatchModelRequest(batch);
  // Preflight comparison volume and source matches before spending on any AI batch.
  const comparisonPreflight=buildVerifiedComparisonReport(documents,{maxLeads:6});
  if(comparisonPreflight.diagnostics.truncated||comparisonPreflight.leads.length>5)return res.status(422).json({error:'COMPARISON_BUDGET_EXCEEDED'});
  if(comparisonPreflight.diagnostics.needsReview)return res.status(422).json({error:'COMPARISON_SOURCE_NOT_READY'});
  for(const lead of comparisonPreflight.leads)createComparisonModelRequest(lead);
  const result=await runPrivateCaseReport(documents,{
   enabled:true,apiKey:process.env.OPENAI_API_KEY,maxDurationMs:105000,
   model:process.env.SQUIDLAW_AI_MODEL||'gpt-4.1-mini',
   analysisOptions:{input:{maxPages:30,maxChars:60000},maxBatches:8,maxTotalChars:60000},
   comparisonOptions:{maxComparisons:5}
  });
  return res.status(200).json(result);
 }catch(error){
  const code=String(error?.message||'UNKNOWN_ERROR');
  if(code==='MODEL_REQUEST_TIMEOUT')return res.status(504).json({error:'AI_ANALYSIS_TIMEOUT'});
  const inputError=/^(INVALID_|NO_|DUPLICATE_|PAGE_LIMIT|TEXT_LIMIT|SOURCE_PAGE_TOO_LARGE|BATCH_PROMPT_TOO_LARGE|TOO_MANY_BATCHES|JOB_TEXT_BUDGET|COMPARISON_BUDGET|COMPARISON_SOURCE|COMPARISON_INPUT|COMPARISON_REQUIRES|AMBIGUOUS_COMPARISON_DOCUMENTS)/.test(code);
  return res.status(inputError?422:502).json({error:inputError?code:'AI_ANALYSIS_FAILED'});
 }
}
