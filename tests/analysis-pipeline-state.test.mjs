import {createAnalysisReceipt} from '../lib/analysis-receipts.mjs';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {ANALYSIS_STAGES,initialPipelineState,advancePipelineState,failPipelineStage,resumePipelineState} from '../lib/analysis-pipeline-state.mjs';
const version='a'.repeat(64);
const receipt=(stage,sourceVersion=version)=>createAnalysisReceipt({stage,sourceVersion,inputs:[],outputs:[],verified:true});
test('ten stages cannot be skipped and must preserve original version',()=>{
 let state=initialPipelineState({caseId:'case',sourceVersion:version});
 assert.throws(()=>advancePipelineState(state,{stage:'legal_reasoning',receipt:receipt('legal_reasoning')}));
 for(const stage of ANALYSIS_STAGES)state=advancePipelineState(state,{stage,checkpoint:{last:stage},receipt:receipt(stage)});
 assert.equal(state.completed.length,ANALYSIS_STAGES.length);
 assert.equal(state.status,'ready_for_final_verification');
 assert.throws(()=>advancePipelineState(state,{stage:'finalize',receipt:receipt('finalize')}));
});
test('blocked stage resumes from same checkpoint without duplicate receipts',()=>{
 let state=initialPipelineState({caseId:'case',sourceVersion:version});
 state=advancePipelineState(state,{stage:'ingest',checkpoint:{page:20},receipt:receipt('ingest')});
 state=failPipelineStage(state,{stage:'text_extract',code:'WORKER_TIMEOUT'});
 assert.equal(state.completed.length,1);assert.equal(state.checkpoint.page,20);
 state=resumePipelineState(state);
 assert.equal(state.stageIndex,1);assert.equal(state.completed.length,1);
 assert.throws(()=>advancePipelineState(state,{stage:'text_extract',receipt:receipt('text_extract','b'.repeat(64))}));
});
