import {validateAnalysisReceipt} from './analysis-receipts.mjs';
import {ANALYSIS_STAGES} from './analysis-pipeline-state.mjs';
import {independentCaseAudit} from './case-reasoning.mjs';
export function finalizeCaseAnalysis({state,units,model,documentCoverage,visualCoverage,semanticAudit}){
 if(!state||!model||state.status!=='ready_for_final_verification'||state.completed?.length!==ANALYSIS_STAGES.length)return {completed:false,reason:'PIPELINE_INCOMPLETE'};
 for(let i=0;i<ANALYSIS_STAGES.length;i++){
  const record=state.completed[i];
  if(record.stage!==ANALYSIS_STAGES[i]||record.receipt?.stage!==record.stage||record.receipt?.sourceVersion!==state.sourceVersion||record.receipt?.verified!==true||!validateAnalysisReceipt(record.receipt))return {completed:false,reason:'INVALID_STAGE_RECEIPT',stage:record.stage};
 }
 const audit=independentCaseAudit({units,model,documentCoverage,visualCoverage,semanticAudit});
 if(!audit.complete)return {completed:false,reason:'CASE_AUDIT_INCOMPLETE',audit};
 return {completed:true,caseId:state.caseId,sourceVersion:state.sourceVersion,modelVersion:model.version,stageCount:state.completed.length,verifiedBy:'pipeline_and_independent_case_audit',audit};
}
