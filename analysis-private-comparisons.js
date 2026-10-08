// Private comparison job: pre-verify every source, then run sequential bounded AI calls.
// A failed or mismatched comparison stops the job; never claim full completion.
import {buildVerifiedComparisonReport} from './analysis-comparison-report.js';
import {analyzeComparisonWithModel} from './analysis-comparison-worker.js';
import {validateComparisonResponse} from './analysis-comparison-response.js';

export async function runPrivateComparisons(documents,{
 enabled=false,apiKey,model,fetchImpl,timeoutMs,maxComparisons=10,
 compare=analyzeComparisonWithModel
}={}){
 if(!enabled)throw Error('AI_COMPARISON_DISABLED');
 if(!Number.isInteger(maxComparisons)||maxComparisons<1||maxComparisons>30)throw Error('INVALID_COMPARISON_LIMIT');
 if(typeof compare!=='function')throw Error('INVALID_COMPARISON_HANDLER');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('MISSING_SERVER_API_KEY');
 if(typeof model!=='string'||!/^gpt-[a-zA-Z0-9.-]+$/.test(model))throw Error('INVALID_MODEL');
 const report=buildVerifiedComparisonReport(documents,{maxLeads:maxComparisons+1});
 if(report.diagnostics.truncated||report.leads.length>maxComparisons)throw Error('COMPARISON_BUDGET_EXCEEDED');
 if(report.diagnostics.needsReview)throw Error('COMPARISON_SOURCE_NOT_READY');
 if(report.leads.length===0){
  return {schema:'squidlaw-private-comparisons-v1',comparisons:[],diagnostics:{processed:0,sourceVerified:0,reason:'NO_SHARED_REFERENCE_LEADS'},sourceReady:false,limitation:'비교할 공통 증거번호 언급을 찾지 못했습니다. 분석 완료 또는 모순 없음으로 해석하지 마세요.'};
 }
 const comparisons=[];
 for(const lead of report.leads){
  const result=await compare(documents,lead,{enabled:true,apiKey,model,fetchImpl,timeoutMs});
  if(!result||result.sourceReady!==true)throw Error('COMPARISON_RESULT_NOT_READY');
  // Never trust a caller-provided sourceReady flag or precomputed checks.
  const verified=validateComparisonResponse(documents,lead,result);
  if(!verified.sourceReady)throw Error('COMPARISON_RESULT_NOT_READY');
  comparisons.push(verified);
 }
 return {
  schema:'squidlaw-private-comparisons-v1',
  comparisons,
  diagnostics:{processed:comparisons.length,sourceVerified:report.diagnostics.sourceMatched},
  sourceReady:comparisons.every(x=>x.sourceReady===true),
  limitation:'AI 해석 후보입니다. 주장 간 실제 모순, 진위 및 법적 결론을 확정하지 않습니다.'
 };
}
