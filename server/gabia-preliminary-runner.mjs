// Standalone Gabia queue -> immutable PDF -> existing SQUIDLAW analysis -> private reports.
// Never start services or charge for models without explicit opt-in.
// Full customer release remains blocked pending original visual/OCR completion gates.
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createGabiaQueue} from './gabia-queue.mjs';
import {loadGabiaJobPdf} from './gabia-job-pdf.mjs';
import {buildGabiaFirstReport,buildGabiaExistingLegalAnalysis} from './gabia-first-report.mjs';
import {formatGabiaFirstReport} from '../lib/gabia-first-report-markdown.mjs';
import {markGabiaPreliminary} from './gabia-preliminary-status.mjs';
const workerPattern=/^[A-Za-z0-9_-]{3,80}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function atomicWrite(path,content){
 const temp=path+'.'+randomUUID()+'.tmp';
 await writeFile(temp,content,{flag:'wx',mode:0o600});
 await rename(temp,path);
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
   legal=await buildGabiaExistingLegalAnalysis({
    pdfBytes:bytes,caseId:job.case_id,clientRole,apiKey:process.env.OPENAI_API_KEY,
    model:process.env.SQUIDLAW_GABIA_LEGAL_MODEL||undefined
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
   visualVerificationCompleted:false
  };
  if(leaseError)throw leaseError;
  await markGabiaPreliminary(pool,{job,workerId,checkpoint});
  return {status:'preliminary_report_written',jobId:job.job_id,
   reportPath:legal?base+'.legal.md':base+'.preliminary.md',
   pageCount:preliminary.pageCount,legalDraftGenerated:!!legal,legalAnalysisCompleted:false};
 }finally{clearInterval(timer)}
}
