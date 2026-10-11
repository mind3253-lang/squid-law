export const ANALYSIS_STAGES=Object.freeze(['ingest','text_extract','visual_inventory','ocr_vision','document_segmentation','case_structure','cross_document_review','legal_reasoning','independent_audit','finalize']);
export function initialPipelineState({caseId,sourceVersion}){
 if(!caseId||!/^[0-9a-f]{64}$/.test(sourceVersion||''))throw Error('INVALID_PIPELINE_SOURCE');
 return {caseId,sourceVersion,stageIndex:0,checkpoint:{},completed:[],status:'queued',errorCount:0};
}
export function advancePipelineState(state,{stage,checkpoint,receipt}){
 if(!state||!ANALYSIS_STAGES.includes(stage)||stage!==ANALYSIS_STAGES[state.stageIndex])throw Error('PIPELINE_STAGE_ORDER');
 if(receipt?.sourceVersion!==state.sourceVersion||receipt?.stage!==stage||receipt?.verified!==true)throw Error('STAGE_RECEIPT_INVALID');
 return {...state,stageIndex:state.stageIndex+1,checkpoint,completed:[...state.completed,{stage,receipt}],status:state.stageIndex+1===ANALYSIS_STAGES.length?'ready_for_final_verification':'queued'};
}
export function failPipelineStage(state,{stage,code}){
 if(stage!==ANALYSIS_STAGES[state.stageIndex]||!code)throw Error('PIPELINE_STAGE_ORDER');
 return {...state,status:'blocked',errorCount:state.errorCount+1,lastError:{stage,code},checkpoint:state.checkpoint};
}
export function resumePipelineState(state){
 if(state?.status!=='blocked')throw Error('PIPELINE_NOT_BLOCKED');
 return {...state,status:'queued',lastError:null};
}
