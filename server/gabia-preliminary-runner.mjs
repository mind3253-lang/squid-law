// One-shot Gabia-only job runner. Produces a real preliminary report, not a completed legal verdict.
// No external requests, no Vercel, no payment, no background service activation.
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createGabiaQueue} from './gabia-queue.mjs';
import {loadGabiaJobPdf} from './gabia-job-pdf.mjs';
import {buildGabiaFirstReport} from './gabia-first-report.mjs';
import {formatGabiaFirstReport} from '../lib/gabia-first-report-markdown.mjs';
const workerPattern=/^[A-Za-z0-9_-]{3,80}$/;
export async function runGabiaPreliminaryJob({pool,storageRoot,reportRoot,workerId}){
 if(!pool?.query||!workerPattern.test(workerId||'')||!storageRoot||!reportRoot)throw Error('INVALID_GABIA_RUNNER_CONFIG');
 const queue=createGabiaQueue(pool);
 const job=await queue.claim(workerId);
 if(!job)return {status:'idle'};
 const {bytes,documentId,sha256}=await loadGabiaJobPdf({pool,root:storageRoot,job});
 const report=await buildGabiaFirstReport({pdfBytes:bytes,documentId});
 if(report.sourceSha256!==sha256)throw Error('GABIA_REPORT_SOURCE_MISMATCH');
 const dir=resolve(reportRoot,job.customer_key,job.case_id);
 await mkdir(dir,{recursive:true,mode:0o700});
 const target=join(dir,job.job_id+'.md');
 const temp=target+'.'+randomUUID()+'.tmp';
 await writeFile(temp,formatGabiaFirstReport(report),{flag:'wx',mode:0o600});
 await rename(temp,target);
 const checkpoint={preliminaryReport:target,sourceSha256:sha256,extractedPages:report.extractedPages,independentlyVerified:false};
 await queue.checkpoint({job,workerId,checkpoint,stage:'preliminary_report_written'});
 return {status:'preliminary_report_written',jobId:job.job_id,reportPath:target,pageCount:report.pageCount,legalAnalysisCompleted:false};
}
