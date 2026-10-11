import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {ANALYSIS_STAGES,initialPipelineState,advancePipelineState,failPipelineStage,resumePipelineState} from '../lib/analysis-pipeline-state.mjs';
const version='a'.repeat(64);
test('ten stages cannot be skipped and must preserve original version',()=>{
 let state=initialPipelineState({caseId:'case',sourceVersion:version});
 assert.throws(()=>advancePipelineState(state,{stage:'legal_reasoning',receipt:{stage:'legal_reasoning',sourceVersion:version,verified:true}}));
 for(const stage of ANALYSIS_STAGES)state=advancePipelineState(state,{stage,checkpoint:{last:stage},receipt:{stage,sourceVersion:version,verified:true}});
 assert.equal(state.completed.length,ANALYSIS_STAGES.length);
 assert.equal(state.status,'ready_for_final_verification');
 assert.throws(()=>advancePipelineState(state,{stage:'finalize',receipt:{stage:'finalize',sourceVersion:version,verified:true}}));
});
test('blocked stage resumes from same checkpoint without duplicate receipts',()=>{
 let state=initialPipelineState({caseId:'case',sourceVersion:version});
 state=advancePipelineState(state,{stage:'ingest',checkpoint:{page:20},receipt:{stage:'ingest',sourceVersion:version,verified:true}});
 state=failPipelineStage(state,{stage:'text_extract',code:'WORKER_TIMEOUT'});
 assert.equal(state.completed.length,1);assert.equal(state.checkpoint.page,20);
 state=resumePipelineState(state);
 assert.equal(state.stageIndex,1);assert.equal(state.completed.length,1);
 assert.throws(()=>advancePipelineState(state,{stage:'text_extract',receipt:{stage:'text_extract',sourceVersion:'other',verified:true}}));
});
