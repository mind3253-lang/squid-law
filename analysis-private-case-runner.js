// Private, explicitly enabled pipeline. Never expose without server authentication,
// payment entitlement, privacy consent, request limits and audit controls.
import {runPrivateAnalysis} from './analysis-private-runner.js';
import {runPrivateComparisons} from './analysis-private-comparisons.js';
import {assembleVerifiedCaseAnalysis} from './analysis-case-report.js';
import {formatCaseReportText} from './analysis-case-report-text.js';

export async function runPrivateCaseReport(documents,{
 enabled=false,apiKey,model,fetchImpl,timeoutMs,
 analysisOptions={},comparisonOptions={},
 analyze=runPrivateAnalysis,compare=runPrivateComparisons
}={}){
 if(!enabled)throw Error('PRIVATE_CASE_REPORT_DISABLED');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('MISSING_SERVER_API_KEY');
 if(typeof model!=='string'||!/^gpt-[a-zA-Z0-9.-]+$/.test(model))throw Error('INVALID_MODEL');
 if(!Array.isArray(documents)||!documents.length)throw Error('INVALID_DOCUMENTS');
 if(typeof analyze!=='function'||typeof compare!=='function')throw Error('INVALID_HANDLER');
 // Both workers receive the same server-owned credentials. Never take enabled from the client.
 const shared={enabled:true,apiKey,model,fetchImpl,timeoutMs};
 const analysis=await analyze(documents,{...analysisOptions,...shared});
 if(!analysis||analysis.schema!=='squidlaw-merged-analysis-v1')throw Error('INVALID_ANALYSIS_RESULT');
 if(analysis.sourceReady!==true)throw Error('ANALYSIS_SOURCE_NOT_READY');
 const comparison=await compare(documents,{...comparisonOptions,...shared});
 if(!comparison||comparison.schema!=='squidlaw-private-comparisons-v1')throw Error('INVALID_COMPARISON_RESULT');
 const report=assembleVerifiedCaseAnalysis(documents,analysis,comparison);
 return {
  schema:'squidlaw-private-case-job-v1',
  report,
  text:formatCaseReportText(report),
  diagnostics:{analysisReady:report.diagnostics.analysisSourceReady,comparisonReady:report.diagnostics.comparisonSourceReady,comparisonPerformed:report.comparisons.length>0,missingBatches:report.diagnostics.missingBatches,unreadablePages:report.diagnostics.unreadablePages,uncitedDocuments:report.diagnostics.uncitedDocuments,unknownCitationDocuments:report.diagnostics.unknownCitationDocuments,verifiedPageCoveragePercent:report.diagnostics.verifiedPageCoveragePercent,verifiedCitationCount:report.diagnostics.verifiedCitationCount,unverifiedCitationCount:report.diagnostics.unverifiedCitationCount},
  sourceReady:report.status==='source_checked',
  comparisonPerformed:report.comparisons.length>0,
  limitation:'원문 인용 검증만 수행합니다. 사실의 진위, AI 비교 해석 및 법적 결론은 사람의 확인이 필요합니다.'
 };
}
