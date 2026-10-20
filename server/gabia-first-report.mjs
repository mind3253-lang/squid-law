// Standalone Gabia PDF first-result runner. No Vercel, network, payment or AI requests.
// Usage: node server/gabia-first-report.mjs /absolute/input.pdf /absolute/output.json
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {extractPdfPages} from '../api/customer-pdf-extract.js';
import {formatGabiaFirstReport} from '../lib/gabia-first-report-markdown.mjs';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeUnit,independentlyVerify,crosscheckObservations} from '../lib/legal-evidence-review.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildGabiaFirstReport({pdfBytes,documentId=randomUUID()}){
 const bytes=Buffer.from(pdfBytes||[]);
 if(bytes.length<5||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('INVALID_PDF');
 const extraction=await extractPdfPages(bytes,{startPage:1,pageCount:Infinity});
 const source=segmentRecord({scope:'customer',documentId,pages:extraction.pages});
 const sourceAudit=auditSegments(extraction.pages,source.segments);
 if(!sourceAudit.complete)throw Error('SOURCE_PAGE_AUDIT_FAILED');
 const reviews=source.segments.map(analyzeUnit);
 const textAudit=independentlyVerify(source.segments,reviews);
 const observations=reviews.flatMap(x=>x.observations||[]);
 const claimCandidates=reviews.flatMap(x=>x.claimCandidates||[]);
 return {
  kind:'gabia_first_result',status:'preliminary_unverified',
  independentlyVerified:false,readyForCourt:false,
  analysisMethod:'local_pdf_text_extraction_and_rule_based_evidence_index',
  limitation:'No AI semantic analysis, visual OCR, legal conclusion or independent semantic verification performed.',
  documentId,sourceSha256:digest(bytes),pageCount:extraction.totalPages,
  extractedPages:extraction.pages.length,sourceAudit,textAudit,
  ocrRequiredPages:source.segments.filter(x=>x.status==='ocr_required').map(x=>x.page),
  observations,claimCandidates,crossDocumentMatches:crosscheckObservations(reviews),
  pages:extraction.pages.map(p=>({page:p.page,textCharacters:p.text.length,imageOperatorCount:p.imageOperatorCount,visualInventoryStatus:p.visualInventoryStatus}))
 };
}
export async function writeGabiaFirstReport({inputPath,outputPath}){
 if(!inputPath||!outputPath)throw Error('INPUT_OUTPUT_REQUIRED');
 const bytes=await readFile(resolve(inputPath));
 const report=await buildGabiaFirstReport({pdfBytes:bytes});
 const target=resolve(outputPath);await mkdir(dirname(target),{recursive:true,mode:0o700});
 const isMarkdown=target.toLowerCase().endsWith('.md');
 const temp=target+'.'+randomUUID()+'.tmp';
 await writeFile(temp,isMarkdown?formatGabiaFirstReport(report):JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
 await rename(temp,target);
 return {path:target,status:report.status,pages:report.pageCount,observations:report.observations.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 writeGabiaFirstReport({inputPath:process.argv[2],outputPath:process.argv[3]})
 .then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
 .catch(error=>{process.stderr.write(String(error?.message||error)+'\n');process.exitCode=1});
}

// Reuse the existing SQUIDLAW legal reasoning engine; never replace it.
// Paid provider calls require an explicit per-run opt-in and are not triggered by the preliminary worker.
export async function buildGabiaExistingLegalAnalysis({pdfBytes,caseId,clientRole,apiKey,model,fetchImpl}){
 if(process.env.SQUIDLAW_GABIA_LEGAL_RUN_APPROVED!=='YES')throw Error('GABIA_LEGAL_RUN_NOT_APPROVED');
 if(!apiKey||!['plaintiff','defendant'].includes(clientRole)||!caseId)throw Error('GABIA_LEGAL_INPUT_REQUIRED');
 const {analyzeLegalWindow}=await import('../lib/gpt-legal-orchestrator.mjs');
 const {buildLegalCustomerReport}=await import('../lib/legal-customer-report.mjs');
 const {buildSemanticReviewRequest,validateSemanticReview,invokeSemanticReview}=await import('../lib/independent-semantic-review.mjs');
 const bytes=Buffer.from(pdfBytes||[]);
 if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('INVALID_PDF');
 const documentId=randomUUID();
 const extraction=await extractPdfPages(bytes,{startPage:1,pageCount:Infinity});
 const source=segmentRecord({scope:'customer',documentId,pages:extraction.pages});
 if(!auditSegments(extraction.pages,source.segments).complete)throw Error('SOURCE_PAGE_AUDIT_FAILED');
 if(source.segments.some(u=>u.status==='ocr_required'))throw Error('VISUAL_OCR_REQUIRED_BEFORE_LEGAL_ANALYSIS');
 const request={caseId,sourceVersion:source.version,clientRole,ready:true,verified:false};
 const windows=[];let cursor=0,previousWindow=null;
 while(cursor<source.segments.length){
  const window=await analyzeLegalWindow({request,sourceUnits:source.segments,cursor,previousWindow,apiKey,model,fetchImpl});
  windows.push(window);cursor=window.nextCursor;previousWindow=window;
 }
 const sourceIndex=source.segments.map(({documentId,page,part,hash})=>({documentId,page,part,hash}));
 const findings=windows.flatMap(w=>w.findings||[]);
 let independentAudit={verified:false,caseId,sourceVersion:source.version};
 if(findings.length){
  const reviewRequest=buildSemanticReviewRequest({caseId,sourceVersion:source.version,findings,sourceUnits:source.segments,model:process.env.SQUIDLAW_GABIA_REVIEW_MODEL||'gpt-4.1-mini'});
  const {result}=await invokeSemanticReview({request:reviewRequest,apiKey,fetchImpl});
  const audit=validateSemanticReview({response:result,caseId,sourceVersion:source.version,findings});
  independentAudit={verified:audit.complete,caseId,sourceVersion:source.version,failures:audit.failures};
 }
 const report=buildLegalCustomerReport({request,windows,sourceIndex,independentAudit});
 return {...report,sourceSha256:digest(bytes),sourcePageCount:extraction.totalPages,
  visualVerificationCompleted:false,warning:'Standalone text-only legal analysis; original visual/OCR coverage and all completion gates must be verified before court use.',
  status:'draft_pending_visual_verification',notForCourtSubmission:true,legalConclusionAvailable:false};
}
