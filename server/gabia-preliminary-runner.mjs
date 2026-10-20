// Standalone Gabia queue -> immutable PDF -> existing SQUIDLAW analysis -> private reports.
// Never start services or charge for models without explicit opt-in.
// Full customer release remains blocked pending original visual/OCR completion gates.
import {mkdir,writeFile,link,unlink,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createGabiaQueue} from './gabia-queue.mjs';
import {loadGabiaJobPdf} from './gabia-job-pdf.mjs';
import {buildGabiaFirstReport} from './gabia-first-report.mjs';
import {extractPdfPages} from '../api/customer-pdf-extract.js';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeLegalWindow} from '../lib/gpt-legal-orchestrator.mjs';
import {LEGAL_TASKS} from '../lib/gpt-legal-expert.mjs';
import {buildLegalCustomerReport} from '../lib/legal-customer-report.mjs';
import {buildSemanticReviewRequest,validateSemanticReview,invokeSemanticReview} from '../lib/independent-semantic-review.mjs';
import {runGabiaVisualReview} from './gabia-visual-review.mjs';
import {formatGabiaFirstReport} from '../lib/gabia-first-report-markdown.mjs';
import {markGabiaPreliminary} from './gabia-preliminary-status.mjs';
import {validateCompletionGates} from '../lib/analysis-stage-gates.mjs';
const workerPattern=/^[A-Za-z0-9_-]{3,80}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function atomicWrite(path,content){
 const temp=path+'.'+randomUUID()+'.tmp';
 await writeFile(temp,content,{flag:'wx',mode:0o600});
 try{await link(temp,path)}catch(error){if(error.code!=='EEXIST')throw error;const old=await readFile(path);if(old.toString()!==content)throw Error('GABIA_IMMUTABLE_REPORT_CONFLICT')}finally{await unlink(temp)}
}
function legalSummary(report){
 const out=['# SQUIDLAW 법률 분석 초안','',
 '> 기존 SQUIDLAW GPT 법률 분석 엔진 결과. 시각 증거/OCR 및 최종 완료 게이트 미검증. 법원 제출용 아님.','',
 '## 쟁점표','| 쟁점 | 원고 주장 | 피고 주장 | 모순·쟁점 |','|---|---|---|---|'];
 for(const f of report.findings||[]){
  const safe=x=>String(x||'확인 필요').replace(/[|\r\n]/g,' ').slice(0,650);
  out.push('| '+[safe(f.claim),safe(f.plaintiffPosition),safe(f.defendantPosition),safe(f.contradiction)].join(' | ')+' |');
 }
 out.push('','## 분석 및 근거');
 for(const [i,f] of (report.findings||[]).entries()){
  const refs=(f.sources||[]).map(s=>`문서 ${s.documentId} p.${s.page} part ${s.part}`).join(', ');
  out.push(`### ${i+1}. ${String(f.claim||'쟁점').slice(0,180)}`,String(f.analysis||f.legalImpact||'추가 분석 필요'),`근거: ${refs||'확인 필요'}`,'');
 }
 out.push('## 결과 및 검증 보류',`독립 의미 검증: ${report.independentSemanticAuditPassed?'통과':'미완료'}`,
  '시각 증거와 OCR 확인 전이므로 최종 법률 판단·고객 공개 완료 상태로 전환하지 않습니다.');
 return out.join('\n')+'\n';
}
async function existingEngineDraft({bytes,documentId,caseId,clientRole,apiKey,model,checkLease,checkpointWindow,loadWindow,visual}){
 // The exact same legal orchestrator, task list and independent reviewer as the original worker.
 const extracted=await extractPdfPages(bytes,{startPage:1,pageCount:Infinity});
 if(extracted.totalPages!==visual.pageCount)throw Error('VISUAL_TEXT_PAGE_COUNT_MISMATCH');
 const mergedPages=extracted.pages.map(page=>{
  const recovered=visual.recoveredText.get(page.page);
  return recovered?{...page,text:recovered}:page;
 });
 const source=segmentRecord({scope:'customer',documentId,pages:mergedPages});
 if(!auditSegments(mergedPages,source.segments).complete)throw Error('SOURCE_PAGE_AUDIT_FAILED');
 // OCR/visual evidence must not be silently treated as reviewed text.
 if(source.segments.some(x=>x.status==='ocr_required'))throw Error('VISUAL_OCR_REQUIRED');
 const units=source.segments;
 const request={caseId,sourceVersion:source.version,clientRole,ready:true,verified:false};
 const windows=[],tasks=[];
 for(const task of LEGAL_TASKS){
  let cursor=0,previousWindow=null;
  while(cursor<units.length){
   await checkLease();
   const saved=await loadWindow({task,cursor,sourceVersion:source.version,previousWindow});
   const window=saved||await analyzeLegalWindow({request,sourceUnits:units,cursor,task,previousWindow,apiKey,model});
   if(window.task!==task||window.cursor!==cursor||window.sourceVersion!==source.version||window.caseId!==caseId||window.nextCursor<=cursor||window.nextCursor>units.length||window.sourceAudit?.complete!==true)throw Error('LEGAL_WINDOW_CHECKPOINT_INVALID');
   windows.push(window);
   if(!saved)await checkpointWindow({task,cursor:window.cursor,window});
   cursor=window.nextCursor;previousWindow=window;
  }
  tasks.push({task,windows:windows.filter(w=>w.task===task).length});
 }
 const findings=windows.flatMap(w=>w.findings||[]);
 const sourceIndex=units.filter(u=>u.part>0).map(({documentId,page,part,hash})=>({documentId,page,part,hash}));
 // The report builder expects contiguous windows of one task. Keep every task's
 // original output in the artifact, and use the source-reading pass for coverage.
 const readingWindows=windows.filter(w=>w.task==='claims_and_rebuttals');
 if(tasks.length!==LEGAL_TASKS.length||new Set(tasks.map(t=>t.task)).size!==LEGAL_TASKS.length)throw Error('LEGAL_TASK_COVERAGE_MISMATCH');
 let independentAudit={verified:false,caseId,sourceVersion:source.version,failures:['VISUAL_VERIFICATION_PENDING']};
 const verdicts=[];
 for(let i=0;i<findings.length;i+=12){
  await checkLease();
  const batch=findings.slice(i,i+12);
  const payload=buildSemanticReviewRequest({caseId,sourceVersion:source.version,findings:batch,sourceUnits:units});
  const reviewed=await invokeSemanticReview({request:payload,apiKey});
  const audit=validateSemanticReview({response:reviewed.result,caseId,sourceVersion:source.version,findings:batch});
  verdicts.push({start:i,complete:audit.complete,failures:audit.failures});
 }
 const reading=buildLegalCustomerReport({request,windows:readingWindows,sourceIndex,independentAudit});
 const semanticPassed=verdicts.length>0&&verdicts.every(v=>v.complete);
 const releaseGates=validateCompletionGates({
  sourceIntegrity:{verified:reading.sourceReferenceAuditPassed===true,sourceVersion:source.version},
  textCoverage:{verified:reading.sourceReviewCoverage?.complete===true,sourceVersion:source.version},
  sourceReadReview:{verified:reading.sourceReviewCoverage?.complete===true,sourceVersion:source.version},
  visualInventory:{verified:visual.verified===true,sourceVersion:source.version},
  ocrCoverage:{verified:false,sourceVersion:source.version},
  visualVerification:{verified:visual.verified===true,sourceVersion:source.version},
  documentBoundaries:{verified:false,sourceVersion:source.version},
  caseStructure:{verified:false,sourceVersion:source.version},
  claimEvidenceReview:{verified:reading.sourceReferenceAuditPassed===true,sourceVersion:source.version},
  legalReasoning:{verified:reading.findings?.length>0,sourceVersion:source.version},
  independentSemanticAudit:{verified:semanticPassed,sourceVersion:source.version}
 });
 return {...reading,findings,allTasks:tasks,semanticVerdicts:verdicts,completionGates:releaseGates,
  sourceSha256:createHash('sha256').update(bytes).digest('hex'),
  sourcePageCount:extracted.totalPages,visualVerificationCompleted:visual.verified,
  status:'draft_pending_full_verification',notForCourtSubmission:true,
  legalConclusionAvailable:false,
  warning:'Existing SQUIDLAW legal engine draft; visual/OCR coverage and full release gates remain pending.'};
}
export async function runGabiaPreliminaryJob({pool,storageRoot,reportRoot,workerId}){
 if(!pool?.query||!workerPattern.test(workerId||'')||!storageRoot?.startsWith('/')||!reportRoot?.startsWith('/'))throw Error('INVALID_GABIA_RUNNER_CONFIG');
 const queue=createGabiaQueue(pool);
 const job=await queue.claim(workerId);
 if(!job)return {status:'idle'};
 let leaseError=null;
 const timer=setInterval(()=>queue.renew({job,workerId}).catch(e=>{leaseError=e}),40000);
 try{
  if(!uuid.test(job.case_id||'')||!uuid.test(job.job_id||'')||!/^[a-f0-9]{64}$/.test(job.customer_key||''))throw Error('INVALID_CLAIMED_JOB');
  const {bytes,documentId,sha256}=await loadGabiaJobPdf({pool,root:storageRoot,job});
  const preliminary=await buildGabiaFirstReport({pdfBytes:bytes,documentId});
  if(preliminary.sourceSha256!==sha256)throw Error('GABIA_REPORT_SOURCE_MISMATCH');
  const dir=resolve(reportRoot,job.customer_key,job.case_id);
  await mkdir(dir,{recursive:true,mode:0o700});
  const base=join(dir,job.job_id);
  if(leaseError)throw leaseError;
  await queue.renew({job,workerId});
  await atomicWrite(base+'.preliminary.json',JSON.stringify(preliminary,null,2));
  await atomicWrite(base+'.preliminary.md',formatGabiaFirstReport(preliminary));
  let legal=null;
  const approved=process.env.SQUIDLAW_GABIA_LEGAL_RUN_APPROVED==='YES';
  if(approved){
   if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY_MISSING');
   const clientRole=process.env.SQUIDLAW_GABIA_CLIENT_ROLE;
   if(!['plaintiff','defendant'].includes(clientRole))throw Error('GABIA_CLIENT_ROLE_REQUIRED');
   if(leaseError)throw leaseError;
   const visual=await runGabiaVisualReview({bytes,documentId,base,apiKey:process.env.OPENAI_API_KEY,
    checkLease:async()=>{if(leaseError)throw leaseError;await queue.renew({job,workerId})},
    checkpoint:async({stage,page})=>queue.checkpoint({job,workerId,stage,checkpoint:{sourceSha256:sha256,visualPage:page,verified:false}})});
   legal=await existingEngineDraft({
    bytes,documentId,caseId:job.case_id,clientRole,apiKey:process.env.OPENAI_API_KEY,visual,
    model:process.env.SQUIDLAW_GABIA_LEGAL_MODEL||undefined,
    checkLease:async()=>{if(leaseError)throw leaseError;await queue.renew({job,workerId})},
    loadWindow:async({task,cursor,sourceVersion,previousWindow})=>{
     const path=base+'.'+task+'.'+String(cursor).padStart(6,'0')+'.json';
     let saved;try{saved=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}
     if(saved.sourceVersion!==sourceVersion||saved.task!==task||saved.cursor!==cursor||saved.caseId!==job.case_id||saved.verified!==false||saved.sourceAudit?.complete!==true||
       (previousWindow&&saved.cursor!==previousWindow.nextCursor))throw Error('LEGAL_WINDOW_RESUME_CONFLICT');
     return saved;
    },
    checkpointWindow:async({task,cursor,window})=>{
     if(leaseError)throw leaseError;
     const safeTask=task.replace(/[^a-z_]/g,'');
     const path=base+'.'+safeTask+'.'+String(window.cursor).padStart(6,'0')+'.json';
     await atomicWrite(path,JSON.stringify(window));
     await queue.checkpoint({job,workerId,stage:'legal_analysis_running',checkpoint:{sourceSha256:sha256,task,cursor,latestWindow:path,verified:false}});
    }
   });
   if(leaseError)throw leaseError;
   await queue.renew({job,workerId});
   await atomicWrite(base+'.legal.json',JSON.stringify(legal,null,2));
   await atomicWrite(base+'.legal.md',legalSummary(legal));
  }
  const checkpoint={
   preliminaryReport:base+'.preliminary.md',sourceSha256:sha256,
   extractedPages:preliminary.extractedPages,independentlyVerified:false,
   legalDraft:legal?base+'.legal.md':null,legalAnalysisExecuted:!!legal,
   visualVerificationCompleted:legal?.visualVerificationCompleted===true,
   completionGates:legal?.completionGates||{complete:false,missing:['LEGAL_ANALYSIS_NOT_EXECUTED']}
  };
  if(leaseError)throw leaseError;
  await markGabiaPreliminary(pool,{job,workerId,checkpoint});
  return {status:'preliminary_report_written',jobId:job.job_id,
   reportPath:legal?base+'.legal.md':base+'.preliminary.md',
   pageCount:preliminary.pageCount,legalDraftGenerated:!!legal,legalAnalysisCompleted:false};
 }finally{clearInterval(timer)}
}
