import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {REQUIRED_ANALYSIS_GATES,validateCompletionGates} from '../lib/analysis-stage-gates.mjs';
import {findDeltaBaseline,verifyDeltaPlan,buildDeltaImpactRequest,validateDeltaImpact,
 buildDeltaRevisionRequest,validateDeltaRevision,buildMergedDeltaReport,inheritDeltaGates,
 invokeDeltaModel} from '../lib/customer-delta-reanalysis.mjs';
import {runDeltaReviewStep} from '../api/customer-delta-worker.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const doc=(id,content)=>({id,sha256:hash(content),pageCount:1});
const before=doc('old','signed contract'),after=doc('new','new evidence');
const version=docs=>hash(JSON.stringify([...docs].map(x=>[x.id,x.sha256,x.pageCount]).sort((a,b)=>a[0].localeCompare(b[0]))));
const prevVersion=version([before]),nowVersion=version([before,after]);
const gates=v=>Object.fromEntries(REQUIRED_ANALYSIS_GATES.map(k=>[k,{verified:true,sourceVersion:v}]));
const oldText='원본 계약서는 5년간 유효합니다.',newText='당사자는 기간 변경에 합의하지 않았습니다.';
const oldRef={documentId:'old',page:1,part:1,hash:hash(oldText)};
const newRef={documentId:'new',page:1,part:1,hash:hash(newText)};
const oldFinding={type:'claim',claim:'기간이 5년입니다.',issueKey:'임대차기간',
 sources:[oldRef],status:'draft'};
const deltaFinding={type:'rebuttal',claim:'변경합의가 없다는 자료',issueKey:'임대차기간',
 sources:[newRef],status:'draft'};
const unaffected={type:'claim',claim:'상대방은 보증금을 지급함',issueKey:'보증금',
 sources:[oldRef],status:'draft'};
const oldReport={caseId:'SL-demo',sourceVersion:prevVersion,reportType:'gpt_legal_analysis',
 clientRole:'defendant',findings:[oldFinding,unaffected],uncertainties:[],
 sourceReviewCoverage:{complete:true},issues:[],status:'reviewed',
 notForCourtSubmission:false,independentSemanticAuditPassed:true};
const freshReport={...oldReport,sourceVersion:nowVersion,findings:[deltaFinding]};
const oldPath='squidlaw/analysis-jobs/customer/SL-demo/old-id/legal-customer-report-final.json';
const baselineJob={jobId:'old-id',caseId:'SL-demo',documentVersion:prevVersion,status:'completed',
 checkpoint:{gates:gates(prevVersion),legalCustomerReport:oldPath,
  textReviewManifest:'old-manifest'}};
const lookup=async path=>path===oldPath?oldReport:path==='old-manifest'?
 {documents:[{id:'old',pageCount:1}]}:null;

test('strict addition selects independently verified original; old PDFs are never reprocessed',async()=>{
 const result=await findDeltaBaseline({jobs:[baselineJob],documents:[before,after],load:lookup});
 assert.deepEqual(result.addedDocuments,[after]);
 assert.deepEqual(verifyDeltaPlan(result,[before,after]),[after]);
 assert.equal(result.baselineReportSha256,hash(JSON.stringify(oldReport)));
 assert.equal(await findDeltaBaseline({jobs:[baselineJob],documents:[before],load:lookup}),null);
 assert.equal(await findDeltaBaseline({jobs:[baselineJob],documents:[doc('old','replaced'),after],load:lookup}),null);
 assert.equal(await findDeltaBaseline({jobs:[{...baselineJob,status:'blocked'}],documents:[before,after],load:lookup}),null);
 assert.equal(await findDeltaBaseline({jobs:[{...baselineJob,checkpoint:{...baselineJob.checkpoint,gates:{}}}],documents:[before,after],load:lookup}),null);
 assert.throws(()=>verifyDeltaPlan(result,[doc('old','changed'),after]),/DELTA_BASELINE_SOURCE_CHANGED/);
 assert.throws(()=>verifyDeltaPlan(result,[before]),/DELTA_DOCUMENT_SET_CHANGED/);
});

test('impact classification must cover every baseline finding (no silently untouched issues)',()=>{
 const req=buildDeltaImpactRequest({caseId:'SL-demo',sourceVersion:nowVersion,
 baselineVersion:prevVersion,oldFindings:[oldFinding,unaffected],newFindings:[deltaFinding]});
 assert.equal(req.store,false);
 assert.equal(JSON.parse(req.input).oldFindings.length,2);
 const decisions=validateDeltaImpact({response:{caseId:'SL-demo',sourceVersion:nowVersion,cursor:0,
  decisions:[{index:1,affected:false,reason:'해당 없음'},{index:0,affected:true,reason:'신규 반증'}]},
  caseId:'SL-demo',sourceVersion:nowVersion,cursor:0,count:2});
 assert.deepEqual(decisions.map(x=>x.index),[0,1]);
 assert.throws(()=>validateDeltaImpact({response:{caseId:'SL-demo',sourceVersion:nowVersion,cursor:0,
  decisions:[{index:0,affected:true,reason:'관련됨'}]},caseId:'SL-demo',
  sourceVersion:nowVersion,cursor:0,count:2}),/COVERAGE/);
});

test('revised finding needs literal verified citation from newly submitted PDF',()=>{
 const sourceUnits=[{...oldRef,text:oldText},{...newRef,text:newText}];
 const req=buildDeltaRevisionRequest({caseId:'SL-demo',sourceVersion:nowVersion,
  baselineVersion:prevVersion,oldFinding,newFindings:[deltaFinding],
  sourceUnits,reason:'변경합의 부존재',model:'gpt-5.4'});
 assert.equal(req.store,false);
 const revised={...oldFinding,claim:'변경합의 자료가 부족하며 기존 기간 주장 재검토 필요',
  sources:[oldRef,newRef],status:'draft'};
 assert.deepEqual(validateDeltaRevision({response:{caseId:'SL-demo',sourceVersion:nowVersion,
  finding:revised},caseId:'SL-demo',sourceVersion:nowVersion,
  newDocIds:['new'],sourceUnits}).sources,[oldRef,newRef]);
 assert.throws(()=>validateDeltaRevision({response:{caseId:'SL-demo',sourceVersion:nowVersion,
  finding:{...revised,sources:[oldRef]}},caseId:'SL-demo',sourceVersion:nowVersion,
  newDocIds:['new'],sourceUnits}),/NO_NEW_EVIDENCE/);
 assert.throws(()=>validateDeltaRevision({response:{caseId:'SL-demo',sourceVersion:nowVersion,
  finding:{...revised,sources:[{...newRef,hash:'a'.repeat(64)}]}},caseId:'SL-demo',
  sourceVersion:nowVersion,newDocIds:['new'],sourceUnits}),/SOURCE_NOT_VERIFIED/);
});

test('merged report leaves unrelated old evidence and conclusions unchanged, records provenance',()=>{
 const changed={...oldFinding,claim:'기존 계약기간 주장에 신규 자료를 반영',sources:[oldRef,newRef]};
 const decisions=[{index:0,affected:true,reason:'추가 반증'},{index:1,affected:false,reason:'무관'}];
 const merged=buildMergedDeltaReport({baseline:oldReport,deltaReport:freshReport,
  decisions,revisions:[{index:0,finding:changed}],sourceVersion:nowVersion,
  baselineVersion:prevVersion,addedDocs:[after],documentSnapshot:[before,after]});
 assert.strictEqual(merged.findings[1],unaffected);
 assert.equal(merged.findings[0].claim,changed.claim);
 assert.deepEqual(merged.findings[2],deltaFinding);
 assert.equal(merged.deltaReanalysis.changedFindings,1);
 assert.equal(merged.deltaReanalysis.unchangedFindings,1);
 assert.equal(merged.deltaReanalysis.newFindings,1);
 assert.equal(merged.deltaReanalysis.changes[0].oldClaim,oldFinding.claim);
 assert.equal(validateCompletionGates(inheritDeltaGates({baselineGates:gates(prevVersion),
  deltaGates:gates(nowVersion),sourceVersion:nowVersion,baselineVersion:prevVersion})).complete,true);
 assert.throws(()=>buildMergedDeltaReport({baseline:oldReport,deltaReport:freshReport,
  decisions,revisions:[],sourceVersion:nowVersion,baselineVersion:prevVersion,
  addedDocs:[after],documentSnapshot:[before,after]}),/REVISION_MISSING/);
});

test('finalization checkpoint reuses reviewed delta decisions, never calls GPT',async()=>{
 const decisions=[{index:0,affected:true,reason:'신규 자료'},{index:1,affected:false,reason:'무관'}];
 const revised={...oldFinding,claim:'변경합의 원문을 재검토한 판단',sources:[oldRef,newRef]};
 const delta={baselineVersion:prevVersion,baselineReportSha256:hash(JSON.stringify(oldReport)),
  baselineReportPath:oldPath,addedDocuments:[after],baselineGates:gates(prevVersion),
  deltaReportPath:'delta-reviewed.json',deltaGates:gates(nowVersion),
  stage:'finalize',impactPaths:['impact-0000.json'],revisionPaths:['revision-0000.json']};
 const job={caseId:'SL-demo',jobId:'new-id',customerKey:'customer',documentVersion:nowVersion};
 const previous={delta,semanticAuditPassed:true};
 const store=new Map([[oldPath,oldReport],['delta-reviewed.json',freshReport],
  ['impact-0000.json',{decisions}],['revision-0000.json',
  {index:0,finding:revised,independentVerified:true,sourceAuditPassed:true}]]);
 let completed;
 const result=await runDeltaReviewStep({job,previous,documents:[before,after],
  prefix:'squidlaw/cases/customer/SL-demo/',load:async p=>store.get(p)||null,
  put:async(p,v)=>{store.set(p,JSON.parse(v))},advanceJob:async(...args)=>{completed=args},
  apiKey:null,model:'gpt-5.4'});
 assert.equal(result.status,'completed');assert.equal(result.changedFindings,1);
 assert.equal(completed[3],'completed');
 assert.equal(completed[2].deltaDocumentSnapshot.length,2);
 assert.equal(completed[2].gates.legalReasoning.inheritedVersion,prevVersion);
 const merged=store.get(result.report);
 assert.equal(merged.findings[1].claim,unaffected.claim);
});

test('worker routes additions ahead of old-document extraction; non-delta full path remains',()=>{
 const worker=readFileSync(new URL('../api/customer-analysis-worker.js',import.meta.url),'utf8');
 assert.match(worker,/completedCaseBaselines\(job\)/);
 assert.match(worker,/docs=verifyDeltaPlan\(job\.checkpoint\.delta,fullDocs\)/);
 assert.match(worker,/runDeltaReviewStep/);
 assert.match(worker,/delta_impact_review_pending/);
 const incremental=readFileSync(new URL('../api/customer-delta-worker.mjs',import.meta.url),'utf8');
 assert.match(incremental,/deltaDocumentSnapshot/);
});

test('GPT usage is never invoked for an invalid or unsuccessful delta response',async()=>{
 let saw=false;
 const req=buildDeltaImpactRequest({caseId:'SL-demo',sourceVersion:nowVersion,
 baselineVersion:prevVersion,oldFindings:[oldFinding],newFindings:[deltaFinding]});
 await assert.rejects(invokeDeltaModel({request:req,apiKey:'test',fetchImpl:async()=>{
  saw=true;return {ok:true,json:async()=>({status:'incomplete'})}}}),/DELTA_GPT_INCOMPLETE/);
 assert.equal(saw,true);
});
