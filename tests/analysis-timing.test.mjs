import test from 'node:test';
import assert from 'node:assert/strict';
import {timedAnalysisStep} from '../lib/analysis-timing.mjs';
test('disabled timer passes through and emits no log',async()=>{
 const lines=[];assert.equal(await timedAnalysisStep('pdf_extract',async()=>42,{enabled:false,sink:x=>lines.push(x)}),42);assert.equal(lines.length,0);
});
test('enabled timer emits only fixed stage outcome and duration',async()=>{
 const lines=[];assert.equal(await timedAnalysisStep('blob_json_read',async()=>7,{enabled:true,sink:x=>lines.push(x)}),7);
 assert.equal(lines.length,1);const data=JSON.parse(lines[0].slice('ANALYSIS_TIMING '.length));
 assert.deepEqual(Object.keys(data),['stage','outcome','durationMs']);
 assert.equal(data.stage,'blob_json_read');assert.equal(data.outcome,'ok');assert.ok(data.durationMs>=0);
});
test('errors are propagated without logging sensitive error text',async()=>{
 const lines=[];await assert.rejects(()=>timedAnalysisStep('pdf_extract',async()=>{throw Error('customer-secret')},{enabled:true,sink:x=>lines.push(x)}),/customer-secret/);
 assert.equal(lines.length,1);assert.doesNotMatch(lines[0],/customer-secret/);
});
