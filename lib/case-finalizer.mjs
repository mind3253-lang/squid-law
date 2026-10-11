import {validateAnalysisReceipt} from './analysis-receipts.mjs';
import {ANALYSIS_STAGES} from './analysis-pipeline-state.mjs';
import {independentCaseAudit} from './case-reasoning.mjs';
export function finalizeCaseAnalysis({state,units,model,documentCoverage,visualCoverage,semanticAudit,providerExecution,auditorExecution}){
 if(!state||!model||state.status!=='ready_for_final_verification'||state.completed?.length!==ANALYSIS_STAGES.length)return {completed:false,reason:'PIPELINE_INCOMPLETE'};
 for(let i=0;i<ANALYSIS_STAGES.length;i++){
  const record=state.completed[i];
  if(record.stage!==ANALYSIS_STAGES[i]||record.receipt?.stage!==record.stage||record.receipt?.sourceVersion!==state.sourceVersion||record.receipt?.verified!==true||!validateAnalysisReceipt(record.receipt))return {completed:false,reason:'INVALID_STAGE_RECEIPT',stage:record.stage};
 }
 const actualProvider=providerExecution?.mock===false&&providerExecution?.sourceVersion===state.sourceVersion&&typeof providerExecution?.responseId==='string'&&providerExecution.responseId.length>0;
 const actualAuditor=auditorExecution?.mock===false&&auditorExecution?.sourceVersion===state.sourceVersion&&typeof auditorExecution?.responseId==='string'&&auditorExecution.responseId.length>0&&auditorExecution.responseId!==providerExecution?.responseId;
 if(!actualProvider||!actualAuditor)return {completed:false,reason:'LIVE_PROVIDER_AND_AUDITOR_NOT_VERIFIED'};
 const audit=independentCaseAudit({units,model,documentCoverage,visualCoverage,semanticAudit});
 if(!audit.complete)return {completed:false,reason:'CASE_AUDIT_INCOMPLETE',audit};
 return {completed:true,caseId:state.caseId,sourceVersion:state.sourceVersion,modelVersion:model.version,stageCount:state.completed.length,verifiedBy:'pipeline_and_independent_case_audit',audit};
}
