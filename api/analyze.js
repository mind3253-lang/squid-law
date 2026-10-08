import {timingSafeEqual} from 'node:crypto';
import {runPrivateCaseReport} from '../analysis-private-case-runner.js';
import {prepareAnalysisInput} from '../analysis-input.js';

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
 if(!equals(req.headers['x-squidlaw-test-token'],token))return res.status(401).json({error:'UNAUTHORIZED'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'MODEL_KEY_NOT_CONFIGURED'});
 const declaredLength=Number(req.headers['content-length']||0);
 if(!Number.isFinite(declaredLength)||declaredLength>160000)return res.status(413).json({error:'REQUEST_TOO_LARGE'});
 if(req.body&&Buffer.byteLength(JSON.stringify(req.body),'utf8')>160000)return res.status(413).json({error:'REQUEST_TOO_LARGE'});
 if(req.body?.consent!==true)return res.status(400).json({error:'EXTERNAL_AI_CONSENT_REQUIRED'});
 try{
  const documents=req.body?.documents;
  if(!Array.isArray(documents)||documents.length<1||documents.length>5)return res.status(422).json({error:'INVALID_DOCUMENT_COUNT'});
  const input=prepareAnalysisInput(documents,{maxPages:30,maxChars:60000});
  const result=await runPrivateCaseReport(documents,{
   enabled:true,apiKey:process.env.OPENAI_API_KEY,
   model:process.env.SQUIDLAW_AI_MODEL||'gpt-4.1-mini',
   analysisOptions:{input,maxBatches:8,maxTotalChars:60000},
   comparisonOptions:{maxComparisons:5}
  });
  return res.status(200).json(result);
 }catch(error){
  const code=String(error?.message||'UNKNOWN_ERROR');
  const inputError=/^(INVALID_|NO_|DUPLICATE_|PAGE_LIMIT|TEXT_LIMIT|TOO_MANY_BATCHES|JOB_TEXT_BUDGET|COMPARISON_BUDGET)/.test(code);
  return res.status(inputError?422:502).json({error:inputError?code:'AI_ANALYSIS_FAILED'});
 }
}
