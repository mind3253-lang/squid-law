import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildLegalExpertRequest,parseLegalExpertResponse} from '../lib/gpt-legal-expert.mjs';
import {analyzeLegalWindow} from '../lib/gpt-legal-orchestrator.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const version='a'.repeat(64),text='계약 기간은 5년이라고 주장한다';
const unit={documentId:'doc',page:1,part:1,text,hash:sha(text)};
const request={caseId:'case',sourceVersion:version,ready:true,verified:false};
const result={caseId:'case',sourceVersion:version,findings:[{type:'claim',claim:'당사자는 계약기간 5년을 주장함',sources:[{documentId:'doc',page:1,part:1,hash:unit.hash}],status:'draft'}]};
const fake=data=>async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]})});
test('GPT request uses source citation and disables stored responses',()=>{
 const payload=buildLegalExpertRequest({caseId:'case',sourceVersion:version,task:'claims_and_rebuttals',units:[unit]});
 assert.equal(payload.store,false);assert.equal(JSON.parse(payload.input).units[0].hash,unit.hash);
});
test('resumable legal GPT output passes only citation integrity and remains unverified',async()=>{
 const out=await analyzeLegalWindow({request,sourceUnits:[unit],apiKey:'test',fetchImpl:fake(result)});
 assert.equal(out.complete,true);assert.equal(out.nextCursor,1);assert.equal(out.verified,false);assert.equal(out.sourceAudit.complete,true);
});
test('invented GPT citations fail',async()=>{
 const bad={...result,findings:[{...result.findings[0],sources:[{...result.findings[0].sources[0],hash:'b'.repeat(64)}]}]};
 await assert.rejects(analyzeLegalWindow({request,sourceUnits:[unit],apiKey:'test',fetchImpl:fake(bad)}),/GPT_LEGAL_SOURCE_AUDIT_FAILED/);
});
test('blocked case cannot trigger a paid API call',async()=>{
 let called=false;
 await assert.rejects(analyzeLegalWindow({request:{...request,ready:false},sourceUnits:[unit],apiKey:'test',fetchImpl:async()=>{called=true}}),/LEGAL_ANALYSIS_NOT_AUTHORIZED/);
 assert.equal(called,false);
});
test('malformed and incomplete model output rejected',()=>{
 assert.throws(()=>parseLegalExpertResponse({status:'incomplete'}),/GPT_LEGAL_INCOMPLETE/);
 assert.throws(()=>parseLegalExpertResponse({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not-json'}]}]}),/GPT_LEGAL_INVALID_JSON/);
});
