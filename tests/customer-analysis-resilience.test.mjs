import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseAnalysisResponse,analysisProgress,AnalysisResponseError,requestAnalysisJson} from '../lib/customer-analysis-response.mjs';
import {auditFinalizationCheckpoint,auditFinalizationParts} from '../lib/finalization-checkpoint.mjs';
import {auditSourceDocuments,auditPageCoverage} from '../lib/customer-source-ingest-audit.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('HTML upstream errors never cause raw JSON syntax exceptions',async()=>{
 await assert.rejects(parseAnalysisResponse({status:503,ok:false,text:async()=>'<html>A server error</html>'}),e=>e instanceof AnalysisResponseError&&e.code==='NON_JSON_SERVER_RESPONSE'&&e.retryable);
});
test('source verification is not legal analysis completion',()=>{
 const x=analysisProgress({status:'retry',stage:'text_review_finalize_checkpoint',checkpoint:{verifiedPages:338,totalPages:338}});
 assert.equal(x.sourcePercent,100);assert.equal(x.analysisComplete,false);
});
test('finalization resumes from existing digest checkpoint',()=>{
 const part={offset:0,sourceVersion:'v',batchCount:8,unitCount:2,sources:[{},{}],claims:[],observations:[],boundaries:[]};
 const cp={finalizeOffset:8,finalizePartDigests:[hash(part)],finalizeUnitCount:2};
 assert.equal(auditFinalizationCheckpoint({checkpoint:cp,descriptorCount:8}).complete,true);
 assert.equal(auditFinalizationParts({parts:[part],checkpoint:cp,descriptorCount:8,sourceVersion:'v'}).units,2);
 assert.throws(()=>auditFinalizationParts({parts:[{...part,unitCount:3}],checkpoint:cp,descriptorCount:8,sourceVersion:'v'}));
});
test('large PDF page coverage rejects duplicate and missing pages',()=>{
 const pages=Array.from({length:338},(_,i)=>({page:i+1}));
 assert.equal(auditPageCoverage({pageCount:338,batches:[{pages}]}).complete,true);
 assert.deepEqual(auditPageCoverage({pageCount:338,batches:[{pages:pages.slice(0,337)}]}).missingPages,[338]);
 assert.throws(()=>auditPageCoverage({pageCount:338,batches:[{pages:[...pages,pages[0]]}]}));
});
test('document metadata rejects duplicate payloads',()=>{
 const doc={id:'a',pageCount:338,sizeBytes:100,sha256:'a'.repeat(64)};
 assert.equal(auditSourceDocuments([doc]).totalPages,338);
 assert.throws(()=>auditSourceDocuments([doc,{...doc,id:'b'}]));
});

test('request wrapper handles successful JSON and invalid gateway output',async()=>{
 const ok=await requestAnalysisJson('/api/test',{fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({status:'retry'})})});
 assert.equal(ok.status,'retry');
 await assert.rejects(requestAnalysisJson('/api/test',{fetchImpl:async()=>({ok:false,status:502,text:async()=>'<html>Bad gateway</html>'})}),e=>e.code==='NON_JSON_SERVER_RESPONSE'&&e.status===502);
});
test('request wrapper normalizes transport failure',async()=>{
 await assert.rejects(requestAnalysisJson('/api/test',{fetchImpl:async()=>{throw Error('private network detail')}}),e=>e.code==='ANALYSIS_NETWORK_ERROR'&&!e.message.includes('private'));
});

test('retry attempt parsing rejects malformed values',async()=>{const {errorRetryDelayMs,shouldPromptlyRedispatch}=await import('../lib/customer-worker-retry.mjs');for(const bad of ['',null,false,true,-1,1.5,'01','1e2',{},[]]){assert.equal(errorRetryDelayMs(bad),null);assert.equal(shouldPromptlyRedispatch(bad),false);}assert.equal(errorRetryDelayMs(0),2250);assert.equal(shouldPromptlyRedispatch('3'),true);assert.equal(shouldPromptlyRedispatch('4'),false);});
