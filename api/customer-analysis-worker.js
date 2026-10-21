import {claimJob,advanceJob as advanceJobRaw,renewJobLease,completedCaseBaselines} from './customer-analysis-jobs-db.js';
import {mayClaimCustomerJob} from '../lib/customer-worker-owner.mjs';
import {visionFailureDisposition,visionFailureDiagnostic} from '../lib/vision-failure-policy.mjs';
import {timedAnalysisStep} from '../lib/analysis-timing.mjs';
// Observe persistence latency across all existing checkpoint paths without changing write semantics.
const advanceJob=(...args)=>timedAnalysisStep('checkpoint_write',()=>advanceJobRaw(...args));
const put=(...args)=>timedAnalysisStep('blob_write',()=>putRaw(...args));
import {findDeltaBaseline,verifyDeltaPlan} from '../lib/customer-delta-reanalysis.mjs';
import {runDeltaReviewStep} from './customer-delta-worker.mjs';
import {get} from '../lib/customer-object-storage.mjs';
export const maxDuration=300;
// Keep model/PDF processing windows independent of the 50-page recovery policy.
// A lower concurrency setting is safe; each window remains an immutable replay receipt.
const VISUAL_WINDOW_CONCURRENCY=Math.min(5,Math.max(1,Number.parseInt(process.env.SQUIDLAW_VISUAL_WINDOW_CONCURRENCY||'5',10)||5));
const RECOVERY_PAGE_INTERVAL=50;
export function completedRecoveryPages(processedPages,totalPages){
 if(!Number.isSafeInteger(processedPages)||processedPages<0||!Number.isSafeInteger(totalPages)||totalPages<0)throw Error('INVALID_RECOVERY_PROGRESS');
 return processedPages>=totalPages?totalPages:Math.floor(processedPages/RECOVERY_PAGE_INTERVAL)*RECOVERY_PAGE_INTERVAL;
}
const FINALIZATION_SOFT_BUDGET_MS=180000;
export function shouldCheckpointFinalization({elapsedMs,completedRounds}){
 if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isSafeInteger(completedRounds)||completedRounds<0)throw Error('INVALID_FINALIZATION_BUDGET');
 return completedRounds>0&&elapsedMs>=FINALIZATION_SOFT_BUDGET_MS;
}
import {aggregateModelUsage} from '../lib/model-usage-observability.mjs';
import {buildCustomerUsageLedger} from '../lib/customer-usage-ledger.mjs';

import {createHash,timingSafeEqual} from 'node:crypto';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeUnit,independentlyVerify,crosscheckObservations} from '../lib/legal-evidence-review.mjs';
import {put as putRaw} from '../lib/customer-object-storage.mjs';
import {candidateDocuments,mergeDocumentBoundaryCandidates} from './customer-document-boundaries.js';
import {extractPdfPages,extractPdfPagesByRange,choosePdfExtractionWindow} from './customer-pdf-extract.js';
import {createCustomerPdfRangeSource} from '../lib/customer-pdf-source.mjs';
import {planVisualEvidence,buildVisualWorkQueue} from '../lib/visual-evidence.mjs';
import {assertPageBatch,assertBatchManifest} from '../lib/batch-integrity.mjs';
import {expectedTextReviewOutputs,auditTextReviewOutputs} from '../lib/text-review-manifest.mjs';
import {verifyPageDigests} from '../lib/page-digests.mjs';
import {ANALYSIS_STAGES} from '../lib/analysis-pipeline-state.mjs';
import {buildLegalReasoningRequest} from '../lib/analysis-stage-gates.mjs';
import {buildTextReviewReport} from '../lib/text-review-report.mjs';
import {auditSourceUnitIndex} from '../lib/legal-reasoning-audit.mjs';
import {buildVisualReferenceManifest} from '../lib/source-continuity.mjs';
import {analyzeLegalWindow} from '../lib/gpt-legal-orchestrator.mjs';
import {analyzePdfVisualEvidence} from '../lib/openai-vision-provider.mjs';
import {splitPdfVisualWindow,splitPdfVisualWindows,splitPdfVisualPageSet,mergeVisualWindows} from '../lib/pdf-visual-windows.mjs';
import {splitRangeVisualWindows,splitRangeVisualPageSet} from '../lib/customer-pdf-visual-range.mjs';
import {auditVisualProviderCoverage,compareIndependentVisualPass} from '../lib/visual-review-audit.mjs';
import {buildSemanticReviewRequest,validateSemanticReview,invokeSemanticReview} from '../lib/independent-semantic-review.mjs';
import {buildLegalCustomerReport} from '../lib/legal-customer-report.mjs';
import {reconcileAnalysisCompletion} from '../lib/analysis-completion-reconciliation.mjs';
import {auditVerifiedTextPages,auditDocumentBoundaryEvidence} from '../lib/source-completion-audit.mjs';
import {reconcileVisualOcr} from '../lib/ocr-visual-recovery.mjs';
import {boundaryReviewRequest,auditBoundaryReview,compareBoundaryReviews,invokeBoundaryReview} from '../lib/independent-boundary-review.mjs';
import {validatePersistedBatch,finalizationDescriptors,validateFinalizationPart,summarizeClaimRoles} from '../lib/text-review-aggregation.mjs';
import {detectOpposingStatements} from '../lib/case-crosscheck.mjs';
import {auditFinalizationCheckpoint,auditFinalizationResumePrefix} from '../lib/finalization-checkpoint.mjs';
export function assertPersistedCustomerReport(expected,reopened){
 if(!expected||!reopened||expected.caseId!==reopened.caseId||expected.sourceVersion!==reopened.sourceVersion||
  createHash('sha256').update(JSON.stringify(expected)).digest('hex')!==createHash('sha256').update(JSON.stringify(reopened)).digest('hex'))
  throw Error('FINAL_CUSTOMER_REPORT_PERSISTENCE_MISMATCH');
 return true;
}
const eq=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
async function load(path){return timedAnalysisStep('blob_json_read',async()=>{const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let size=0,parts=[];for await(const chunk of r.stream){size+=chunk.length;if(size>32*1024*1024)throw Error('BLOB_TOO_LARGE');parts.push(Buffer.from(chunk))}return JSON.parse(Buffer.concat(parts).toString())})}
async function loadBinary(path,maxBytes=105*1024*1024){return timedAnalysisStep('blob_binary_read',async()=>{const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let size=0;const chunks=[];for await(const chunk of r.stream){size+=chunk.length;if(size>maxBytes)throw Error('SOURCE_PDF_TOO_LARGE');chunks.push(Buffer.from(chunk))}return Buffer.concat(chunks)})}
/**
 * The customer uploads a whole PDF as immutable parts. Every source window is
 * parsed on-demand; no step needs to Buffer.concat all original parts.
 */
async function extractCustomerPdfWindow(prefix,doc,options){
 if(doc.sourceKind==='private_chunked_pdf_v1'){
  const source=createCustomerPdfRangeSource(prefix,doc);
  const result=await timedAnalysisStep('pdf_extract',()=>extractPdfPagesByRange(source,options));
  if(result.totalPages!==doc.pageCount)throw Error('CHUNKED_PDF_PAGE_COUNT_CHANGED');
  return result;
 }
 const bytes=await loadBinary(prefix+'pdf/'+doc.id+'.pdf');
 if(!bytes||createHash('sha256').update(bytes).digest('hex')!==doc.sha256)
  throw Error('SOURCE_PDF_DIGEST_MISMATCH');
 return timedAnalysisStep('pdf_extract',()=>extractPdfPages(bytes,options));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'METHOD'});
 if(!process.env.CRON_SECRET||!eq(String(req.headers.authorization||''),'Bearer '+process.env.CRON_SECRET))return res.status(401).json({error:'UNAUTHORIZED'});
 if(!mayClaimCustomerJob())return res.status(200).json({status:'inactive_owner'});
 let job,heartbeat=null,heartbeatBusy=false,leaseExpired=false;
 try{
  job=await claimJob();
  if(!job)return res.status(200).json({status:'idle'});
  // Long PDF and vision windows must retain their fenced owner across stages.
  heartbeat=setInterval(()=>{
   if(heartbeatBusy||leaseExpired)return;
   heartbeatBusy=true;
   void renewJobLease(job).catch(e=>{
    leaseExpired=true;
    console.error('CUSTOMER_JOB_LEASE_RENEWAL_FAILED',String(e?.message||e).slice(0,90));
   }).finally(()=>{heartbeatBusy=false});
  },25000);
  heartbeat.unref?.();
 const prefix='squidlaw/cases/'+job.customerKey+'/'+job.caseId+'/';
 const registry=await load('squidlaw/cases/'+job.customerKey+'/registry/'+job.caseId+'.json');
 if(!registry||registry.id!==job.caseId)throw Error('CASE_NOT_FOUND');
 // Never mark complete before OCR, image evidence, cross-document reasoning and independent verification have passed.
 const blob=(await import('../lib/customer-object-storage.mjs'));let cursor,paths=[];do{const listing=await blob.list({prefix:prefix+'docs/',limit:1000,...(cursor?{cursor}:{})});paths.push(...listing.blobs.filter(b=>b.pathname.endsWith('.json')).map(b=>b.pathname));cursor=listing.hasMore?listing.cursor:null}while(cursor);
 const meta=[];for(let i=0;i<paths.length;i+=24)meta.push(...await Promise.all(paths.slice(i,i+24).map(p=>load(p))));
 if(meta.some(x=>!x))throw Error('DOCUMENT_METADATA_MISSING');
 if(meta.some(x=>!x.id||!Number.isSafeInteger(x.pageCount)||x.pageCount<1||!/^[a-f0-9]{64}$/.test(x.sha256||'')))throw Error('DOCUMENT_METADATA_INVALID');
 if(new Set(meta.map(x=>x.id)).size!==meta.length)throw Error('DUPLICATE_DOCUMENT_METADATA');
 if(meta.length===0)throw Error('EMPTY_CASE_DOCUMENTS');
 let docs=meta.sort((a,b)=>a.id.localeCompare(b.id));
 const fullDocs=docs;
 const version=createHash('sha256').update(JSON.stringify(docs.map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 if(version!==job.documentVersion){await advanceJob(job,'source_changed',{expected:job.documentVersion,actual:version},'blocked','SOURCE_VERSION_CHANGED');return res.status(200).json({status:'blocked',reason:'SOURCE_VERSION_CHANGED'})}

 // Completed reports may be reused ONLY for a strict addition of immutable PDFs.
 // Never infer a baseline from unverified, replaced, or deleted evidence.
 if(!job.checkpoint?.delta&&job.checkpoint?.nextDocument===undefined&&
  !job.checkpoint?.textReviewManifest&&!job.checkpoint?.phase){
  const candidates=await completedCaseBaselines(job);
  const baseline=await findDeltaBaseline({jobs:candidates,documents:fullDocs,load});
  if(baseline){
   const prior=await load(baseline.baselineReportPath);
   if(prior?.clientRole!==registry.intake?.clientRole){
    await advanceJob(job,'delta_client_role_changed',job.checkpoint||{},'blocked','DELTA_CLIENT_ROLE_CHANGED');
    return res.status(200).json({status:'blocked',reason:'DELTA_CLIENT_ROLE_CHANGED'});
   }
   await advanceJob(job,'delta_evidence_selected',{
    delta:baseline,phase:'extract',nextDocument:0,nextPage:0,
    documentCount:baseline.addedDocuments.length},'retry');
   return res.status(200).json({status:'retry',stage:'delta_evidence_selected',
    addedDocuments:baseline.addedDocuments.length,baselineJobId:baseline.baselineJobId});
  }
  // A completed prior job exists, but its material cannot safely be
  // inherited (deleted/replaced sources or missing receipts). Never
  // surprise-bill the customer for a full rerun as an implicit fallback.
  if(candidates.length){
   await advanceJob(job,'delta_baseline_unavailable',job.checkpoint||{},'blocked','DELTA_BASELINE_UNAVAILABLE');
   return res.status(200).json({status:'blocked',reason:'DELTA_BASELINE_UNAVAILABLE'});
  }
 }
 if(job.checkpoint?.delta){
  docs=verifyDeltaPlan(job.checkpoint.delta,fullDocs);
  if(!docs.length)throw Error('DELTA_EVIDENCE_EMPTY');
  if(['impact','revision','finalize'].includes(job.checkpoint.delta.stage)){
   if(process.env.SQUIDLAW_LEGAL_API_ENABLED!=='true'||!process.env.OPENAI_API_KEY){
    await advanceJob(job,'delta_legal_api_approval_pending',job.checkpoint,'blocked','LEGAL_API_NOT_ENABLED');
    return res.status(200).json({status:'blocked',reason:'LEGAL_API_NOT_ENABLED'});
   }
   const outcome=await runDeltaReviewStep({job,previous:job.checkpoint,documents:fullDocs,
    prefix,load,put,advanceJob,apiKey:process.env.OPENAI_API_KEY,
    model:process.env.SQUIDLAW_LEGAL_MODEL||'gpt-5.4'});
   return res.status(200).json(outcome);
  }
 }
 const previous=job.checkpoint||{};
 const extractionOnly=previous.phase==='extract'||(previous.nextDocument===undefined&&previous.phase===undefined);
 if(previous.nextDocument!==undefined&&!Number.isSafeInteger(previous.nextDocument))throw Error('INVALID_DOCUMENT_CHECKPOINT');
 const index=previous.nextDocument??0;
 if(index<0||index>docs.length)throw Error('INVALID_DOCUMENT_CHECKPOINT');
 if(index===docs.length&&previous.nextPage!==0&&previous.nextPage!==undefined)throw Error('INVALID_TERMINAL_PAGE_CHECKPOINT');
 if(index===docs.length&&Number.isSafeInteger(previous.finalizeOffset)&&!previous.textReviewManifest){
  const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
  const descriptors=finalizationDescriptors(docs);
  const offset=previous.finalizeOffset;
  auditFinalizationCheckpoint({checkpoint:previous,descriptorCount:descriptors.length});
  if(offset<descriptors.length){
   // Parallel reads preserve the complete finalization integrity audit.
   const prefixPaths=Array.from({length:Math.ceil(offset/8)},(_,i)=>root+'finalize-parts/'+String(i*8).padStart(8,'0')+'.json');
   const prefixParts=[];
   for(let start=0;start<prefixPaths.length;start+=12){
    prefixParts.push(...await Promise.all(prefixPaths.slice(start,start+12).map(load)));
   }
   auditFinalizationResumePrefix({parts:prefixParts,checkpoint:previous,descriptorCount:descriptors.length,sourceVersion:job.documentVersion});
   let cursor=offset,countTotal=previous.finalizeUnitCount||0;
   const digests=[...(previous.finalizePartDigests||[])];
   const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
   const finalizationStartedAt=Date.now();
   for(let round=0;round<8&&cursor<descriptors.length;round++){
    if(shouldCheckpointFinalization({elapsedMs:Date.now()-finalizationStartedAt,completedRounds:round}))break;
    const selected=descriptors.slice(cursor,cursor+8);
    const batches=await Promise.all(selected.map(x=>load(root+x.documentId+'-'+String(x.start).padStart(8,'0')+'.json')));
    const claims=[],observations=[],boundaries=[],sources=[];let count=0;
    for(let i=0;i<selected.length;i++){
     const x=selected[i],verified=validatePersistedBatch({batch:batches[i],documentId:x.documentId,sourceVersion:job.documentVersion,pageStart:x.start+1,pageCount:x.count});
     count+=verified.unitCount;
     for(const source of verified.sourceUnits)sources.push(source);
     for(const claim of verified.claimResults)claims.push(claim);
     for(const observation of verified.observationResults)observations.push(observation);
     boundaries.push({documentId:x.documentId,sections:batches[i].documentBoundaryCandidates?.sections});
    }
    if(digests.length!==Math.ceil(cursor/8))throw Error('INVALID_FINALIZATION_DIGEST_CHECKPOINT');
    const partPath=root+'finalize-parts/'+String(cursor).padStart(8,'0')+'.json';
    const part={sourceVersion:job.documentVersion,offset:cursor,batchCount:selected.length,unitCount:count,claims,observations,boundaries,sources};
    const old=await load(partPath);
    if(old&&hash(old)!==hash(part))throw Error('FINALIZATION_PART_CONFLICT');
    if(!old)await put(partPath,JSON.stringify(part),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
    digests.push(hash(part));countTotal+=count;cursor+=selected.length;
   }
   await advanceJob(job,'text_review_finalize_checkpoint',{...previous,finalizeOffset:cursor,finalizeUnitCount:countTotal,finalizePartDigests:digests},'retry');
   return res.status(200).json({status:'retry',stage:'text_review_finalize_checkpoint',verifiedBatches:cursor,totalBatches:descriptors.length});
  }
  if(!Array.isArray(previous.finalizePartDigests)||previous.finalizePartDigests.length!==Math.ceil(descriptors.length/8))throw Error('FINALIZATION_DIGEST_COUNT_MISMATCH');
  const claims=[],observations=[],boundaries=[],sources=[];let total=0;
  const partOffsets=Array.from({length:Math.ceil(descriptors.length/8)},(_,i)=>i*8);
  const finalizedParts=[];
  for(let i=0;i<partOffsets.length;i+=12){
   finalizedParts.push(...await Promise.all(partOffsets.slice(i,i+12).map(start=>load(root+'finalize-parts/'+String(start).padStart(8,'0')+'.json'))));
  }
  for(let i=0;i<partOffsets.length;i++){
   const start=partOffsets[i],part=finalizedParts[i];
   if(!part)throw Error('FINALIZATION_PART_MISSING');
   validateFinalizationPart(part,{sourceVersion:job.documentVersion,offset:start,batchCount:Math.min(8,descriptors.length-start),sha256:previous.finalizePartDigests[Math.floor(start/8)]});
   total+=part.unitCount;
   for(const claim of part.claims)claims.push(claim);
   for(const observation of part.observations||[])observations.push(observation);
   for(const boundary of part.boundaries||[])boundaries.push(boundary);
   for(const source of part.sources||[])sources.push(source);
  }
  if(total!==previous.finalizeUnitCount||sources.length!==total)throw Error('FINALIZATION_COUNT_MISMATCH');
  // Source completeness is a deterministic gate, not a substitute for GPT legal reasoning.
  auditSourceUnitIndex({documents:docs,sources});
  // Group boundary evidence once; avoid rescanning every finalized batch per document.
  const boundariesByDocument=new Map();
  for(const boundary of boundaries){
   if(!boundariesByDocument.has(boundary.documentId))boundariesByDocument.set(boundary.documentId,[]);
   boundariesByDocument.get(boundary.documentId).push(boundary);
  }
  const documentBoundaryCandidates=docs.map(d=>mergeDocumentBoundaryCandidates({documentId:d.id,pageCount:d.pageCount,batches:boundariesByDocument.get(d.id)||[]}));
  const aggregate={caseId:job.caseId,sourceVersion:job.documentVersion,coverage:docs.map(d=>({documentId:d.id,pages:d.pageCount,textBatchCount:Math.ceil(d.pageCount/20)})),observationCount:total,opposingStatementCandidates:detectOpposingStatements(claims),claimRoleSummary:summarizeClaimRoles(claims),crossDocumentEvidenceLinks:crosscheckObservations(observations),documentBoundaryCandidates,verifiedLegal:false,verifiedVisual:false,status:'awaiting_visual_and_semantic_review'};
  const aggregatePath=root+'text-review-aggregate.json',manifestPath=root+'text-review-manifest.json';
  const intermediateReportPath=root+'text-review-intermediate-report.json';
  const intermediateReport=buildTextReviewReport(aggregate);
  await put(intermediateReportPath,JSON.stringify(intermediateReport),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await put(aggregatePath,JSON.stringify(aggregate),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  const sourceIndexPath=root+'source-unit-index.json';
  const sourceIndexPayload={caseId:job.caseId,sourceVersion:job.documentVersion,sources};
  const sourceIndexSha256=createHash('sha256').update(JSON.stringify(sourceIndexPayload)).digest('hex');
  await put(sourceIndexPath,JSON.stringify(sourceIndexPayload),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  const partPaths=Array.from({length:Math.ceil(descriptors.length/8)},(_,i)=>root+'finalize-parts/'+String(i*8).padStart(8,'0')+'.json');
  const legalReasoningRequestPath=root+'legal-reasoning-request.json';
  const aggregateSha256=createHash('sha256').update(JSON.stringify(aggregate)).digest('hex');
  const legalRequest=buildLegalReasoningRequest({caseId:job.caseId,sourceVersion:job.documentVersion,aggregatePath,aggregateSha256,sourceIndexPath,sourceIndexSha256,partPaths,partDigests:previous.finalizePartDigests,clientRole:registry.intake?.clientRole});
  await put(legalReasoningRequestPath,JSON.stringify(legalRequest),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await put(manifestPath,JSON.stringify({caseId:job.caseId,sourceVersion:job.documentVersion,documents:docs.map(x=>({id:x.id,pageCount:x.pageCount})),outputs:expectedTextReviewOutputs({root,documents:docs}),aggregateSha256,verifiedVisual:false,verifiedLegal:false,analysisComplete:false,pendingStages:ANALYSIS_STAGES.slice(2)}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'text_review_completed_visual_pending',{...previous,phase:'verify',textReviewManifest:manifestPath,textReviewAggregate:aggregatePath,textReviewIntermediateReport:intermediateReportPath,legalReasoningRequest:legalReasoningRequestPath,sourceUnitIndex:sourceIndexPath},'retry');
  return res.status(200).json({status:'retry',stage:'text_review_completed_visual_pending',verifiedTextDocuments:docs.length});
 }
 if(index>=docs.length&&previous.visualReview?.verified===true&&!previous.boundaryReviewVerified){
  const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
  const boundaryIndex=previous.boundaryDocIndex||0;
  if(boundaryIndex<docs.length){
   const d=docs[boundaryIndex],base=root+'boundary-audit/'+d.id;
   const primaryPath=base+'-primary.json',secondPath=base+'-independent.json';
   const candidateAggregate=await load(previous.textReviewAggregate);
   const candidate=candidateAggregate?.documentBoundaryCandidates?.find(x=>x.documentId===d.id);
   const visual=await load(root+'visual-provider/'+d.id+'.json');
   const pageEvidence=[];
   const visualByPage=new Map((visual?.observations?.pageObservations||[]).map(x=>[x.page,x.visualFacts||[]]));
   for(let start=0;start<d.pageCount;start+=240){
    const offsets=Array.from({length:Math.min(12,Math.ceil((d.pageCount-start)/20))},(_,i)=>start+i*20);
    const batches=await Promise.all(offsets.map(offset=>load(prefix+'verified/'+d.id+'/batch-'+String(offset).padStart(8,'0')+'.json')));
    for(const batch of batches){
     if(!batch||batch.sourcePdfSha256!==d.sha256)throw Error('BOUNDARY_SOURCE_MISSING');
     for(const p of batch.pages)pageEvidence.push({page:p.page,text:String(p.text||'').slice(0,450),visualFacts:(visualByPage.get(p.page)||[]).slice(0,5)});
    }
   }
   const input={documentId:d.id,sourcePdfSha256:d.sha256,pageCount:d.pageCount,candidates:candidate?.sections||[],pageEvidence,model:process.env.SQUIDLAW_LEGAL_MODEL||'gpt-4.1-mini'};
   let primary=await load(primaryPath);
   if(!primary){
    primary=await invokeBoundaryReview({request:boundaryReviewRequest(input),apiKey:process.env.OPENAI_API_KEY});
    const audit=auditBoundaryReview({result:primary,documentId:d.id,sourcePdfSha256:d.sha256,pageCount:d.pageCount});
    if(!audit.complete)throw Error('BOUNDARY_PRIMARY_INVALID:'+audit.failures.join(','));
    await put(primaryPath,JSON.stringify(primary),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
    await advanceJob(job,'boundary_primary_checkpoint',{...previous,boundaryDocIndex:boundaryIndex},'retry');
    return res.status(200).json({status:'retry',stage:'boundary_primary_checkpoint'});
   }
   // The primary model classified the entire document. Verify its partition deterministically.
   const checked=auditBoundaryReview({result:primary,documentId:d.id,sourcePdfSha256:d.sha256,pageCount:d.pageCount});
   if(!checked.complete)throw Error('BOUNDARY_PRIMARY_INVALID:'+checked.failures.join(','));
   const audit={...checked,verified:true,documentId:d.id,sourcePdfSha256:d.sha256,sections:primary.sections,coveredPages:d.pageCount};
   await put(base+'-verified.json',JSON.stringify(audit),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
   await advanceJob(job,'boundary_verified_checkpoint',{...previous,boundaryDocIndex:boundaryIndex+1},'retry');
   return res.status(200).json({status:'retry',stage:'boundary_verified_checkpoint'});
  }
  await advanceJob(job,'boundary_review_completed',{...previous,boundaryReviewVerified:true},'retry');
  return res.status(200).json({status:'retry',stage:'boundary_review_completed'});
 }
 if(index>=docs.length&&!previous.legalCustomerReport&&previous.visualReview?.verified===true&&previous.visualReview?.verified===true&&previous.visualReview?.sourceVersion===job.documentVersion&&previous.legalReasoningRequest&&previous.sourceUnitIndex){
  const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
  const request=await load(previous.legalReasoningRequest);
  const sourceIndex=await load(previous.sourceUnitIndex);
  if(!request||!sourceIndex||sourceIndex.sourceVersion!==job.documentVersion||request.sourceVersion!==job.documentVersion)throw Error('LEGAL_SOURCE_VERSION_MISMATCH');
  if(!['plaintiff','defendant'].includes(request.clientRole)||request.clientRole!==registry.intake?.clientRole){
   await advanceJob(job,'legal_client_role_changed',previous,'blocked','ANALYSIS_ROLE_CHANGED');
   return res.status(200).json({status:'blocked',reason:'ANALYSIS_ROLE_CHANGED'});
  }
  if(process.env.SQUIDLAW_LEGAL_API_ENABLED!=='true'||!process.env.OPENAI_API_KEY){
   await advanceJob(job,'legal_api_approval_pending',previous,'blocked','LEGAL_API_NOT_ENABLED');
   return res.status(200).json({status:'blocked',reason:'LEGAL_API_NOT_ENABLED'});
  }
  const authorized={...request,clientRole:request.clientRole||registry.intake?.clientRole||null,ready:true,status:'authorized_after_visual_review'};
  const task=authorized.requestedTasks?.[previous.legalTaskIndex||0];
  if(!task)throw Error('INVALID_LEGAL_TASK');
  const cursor=previous.legalCursor||0;
  // Verified original text bundle is immutable for this documentVersion. It
  // replaces a full 338-page multi-Blob rehydration on EVERY legal-model call.
  // The first request still verifies all original immutable page batches.
  const bundlePath=root+'legal-source-text-bundle.json';
  let bundle=await load(bundlePath);
  let units;
  if(bundle){
   if(bundle.caseId!==job.caseId||bundle.sourceVersion!==job.documentVersion||
    bundle.sourceIndexSha256!==request.sourceIndexSha256||
    !Array.isArray(bundle.units))throw Error('LEGAL_SOURCE_BUNDLE_VERSION_MISMATCH');
   units=bundle.units;
  }else{
   units=[];
   const batchRefs=docs.flatMap(d=>Array.from({length:Math.ceil(d.pageCount/20)},
    (_,i)=>({d,start:i*20})));
   for(let i=0;i<batchRefs.length;i+=12){
    const selected=batchRefs.slice(i,i+12);
    const batches=await Promise.all(selected.map(({d,start})=>
     load(prefix+'verified/'+d.id+'/batch-'+String(start).padStart(8,'0')+'.json')));
    for(let j=0;j<selected.length;j++){
     const {d}=selected[j],extracted=batches[j];
     if(!extracted?.pages||extracted.documentId!==d.id||
      extracted.sourcePdfSha256!==d.sha256)throw Error('LEGAL_SOURCE_TEXT_MISSING');
     const segments=segmentRecord({scope:'customer',documentId:d.id,pages:extracted.pages}).segments;
     for(const u of segments)if(u.part>0)
      units.push({documentId:d.id,page:u.page,part:u.part,hash:u.hash,text:u.text});
    }
   }
  }
  const indexed=new Map(sourceIndex.sources.map(x=>[x.documentId+':'+x.page+':'+x.part,x.hash]));
  if(units.length!==sourceIndex.sources.length||
   units.some(u=>!u||typeof u.text!=='string'||
    createHash('sha256').update(u.text).digest('hex')!==u.hash||
    indexed.get(u.documentId+':'+u.page+':'+u.part)!==u.hash))
   throw Error('LEGAL_SOURCE_REHYDRATION_MISMATCH');
  if(!bundle){
   const payload={caseId:job.caseId,sourceVersion:job.documentVersion,
    sourceIndexSha256:request.sourceIndexSha256,units};
   const serialized=JSON.stringify(payload);
   // A huge dense case can still take the legacy verified-source path.
   if(Buffer.byteLength(serialized,'utf8')<28*1024*1024)
    await put(bundlePath,serialized,{access:'private',allowOverwrite:false,
     addRandomSuffix:false,contentType:'application/json'});
  }
  const path=root+'legal-windows/'+String(previous.legalTaskIndex||0).padStart(2,'0')+'-'+String(cursor).padStart(8,'0')+(task==='claims_and_rebuttals'?'-read-receipts-v1':'')+'.json';
  let part=await load(path);
  if(part){
   if(part.caseId!==job.caseId||part.sourceVersion!==job.documentVersion||part.task!==task||part.cursor!==cursor||part.sourceAudit?.complete!==true)throw Error('LEGAL_WINDOW_CACHE_INVALID');
   if(task==='claims_and_rebuttals'&&part.reviewAudit?.complete!==true)throw Error('LEGAL_WINDOW_CACHE_REQUIRES_SOURCE_READ_RECEIPTS');
  }else{
   const priorPath=cursor>0?(previous.legalWindowPaths||[]).at(-1):null;
   const previousWindow=priorPath?await load(priorPath):null;
   part=await timedAnalysisStep('legal_reasoning',()=>analyzeLegalWindow({request:authorized,sourceUnits:units,cursor,task,previousWindow,apiKey:process.env.OPENAI_API_KEY,model:process.env.SQUIDLAW_LEGAL_MODEL||'gpt-5.4',maxCharacters:64000}));
   await put(path,JSON.stringify(part),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  }
  const paths=[...(previous.legalWindowPaths||[]),path];
  const nextTask=part.complete?(previous.legalTaskIndex||0)+1:(previous.legalTaskIndex||0);
  const nextCursor=part.complete?0:part.nextCursor;
  if(nextTask<authorized.requestedTasks.length){
   await advanceJob(job,'legal_reasoning_checkpoint',{...previous,legalTaskIndex:nextTask,legalCursor:nextCursor,legalWindowPaths:paths},'retry');
   return res.status(200).json({status:'retry',stage:'legal_reasoning_checkpoint',task:nextTask,cursor:nextCursor});
  }
  const windows=await Promise.all(paths.map(p=>load(p)));
  // One source pass, with context carried between windows. Synthesize by issue,
  // not by page or by six separate full-document task repetitions.
  const initial=buildLegalCustomerReport({request:authorized,windows,sourceIndex:sourceIndex.sources});
  const issueGroups=new Map();
  for(const finding of initial.findings){
   const key=String(finding.issueKey||finding.claim||'unclassified').trim().slice(0,180);
   if(!issueGroups.has(key))issueGroups.set(key,[]);
   issueGroups.get(key).push(finding);
  }
  const findings=[...issueGroups.values()].flat();
  const report={...initial,modelUsage:aggregateModelUsage(windows.map(w=>w.modelUsage).filter(Boolean)),
   clientRole:authorized.clientRole,findings,sourceCoverage:{tasks:1,processedUnits:units.length},
   status:'draft_pending_verification',notForCourtSubmission:true,legalConclusionAvailable:false,
   independentSemanticAuditPassed:false};
  const reportPath=root+'legal-customer-report.json';
  await put(reportPath,JSON.stringify(report),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'legal_reasoning_independent_review_pending',{...previous,legalTaskIndex:nextTask,legalCursor:0,legalWindowPaths:paths,legalCustomerReport:reportPath},'retry');
  return res.status(200).json({status:'retry',stage:'legal_reasoning_independent_review_pending'});
 }
 if(index>=docs.length&&previous.legalCustomerReport&&previous.visualReview?.verified===true){
  const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
  const report=await load(previous.legalCustomerReport);
  if(!report||report.sourceVersion!==job.documentVersion)throw Error('SEMANTIC_REPORT_SOURCE_MISMATCH');
  if(!['plaintiff','defendant'].includes(report.clientRole)||report.clientRole!==registry.intake?.clientRole){
   await advanceJob(job,'semantic_client_role_changed',previous,'blocked','ANALYSIS_ROLE_CHANGED');
   return res.status(200).json({status:'blocked',reason:'ANALYSIS_ROLE_CHANGED'});
  }
  // The legal model has already read each immutable source unit once.
  // Verify its cited references deterministically, without a second AI interpretation.
  const sourceRows=(await load(previous.sourceUnitIndex))?.sources||[];
  const sourceKeys=new Set(sourceRows.map(x=>x.documentId+':'+x.page+':'+x.part+':'+x.hash));
  const citationFailures=[];
  for(const [i,finding] of report.findings.entries()){
   if(!Array.isArray(finding.sources)||!finding.sources.length||
    finding.sources.some(ref=>!sourceKeys.has(ref.documentId+':'+ref.page+':'+ref.part+':'+ref.hash)))
    citationFailures.push(i);
  }
  if(citationFailures.length){
   await advanceJob(job,'citation_integrity_failed',{...previous,citationFailures:citationFailures.slice(0,30)},'blocked','CITATION_INTEGRITY_FAILED');
   return res.status(200).json({status:'blocked',reason:'CITATION_INTEGRITY_FAILED'});
  }
  const indexData=await load(previous.sourceUnitIndex);
  const aggregate=await load(previous.textReviewAggregate);
  const visualAudits=[];
  for(const doc of docs){
   const rootPath=root+'visual-provider/';
   const primary=await load(rootPath+doc.id+'.json');
   visualAudits.push({documentId:doc.id,verified:primary?.sourcePdfSha256===doc.sha256&&primary?.pageCount===doc.pageCount,sourceCoverageVerified:previous.visualSourceCoveragePassed===true});
  }
  // Bounded concurrent reads keep final verification ordered without serial Blob RTTs.
  const verifiedPaths=docs.flatMap(doc=>Array.from({length:Math.ceil(doc.pageCount/20)},(_,i)=>prefix+'verified/'+doc.id+'/batch-'+String(i*20).padStart(8,'0')+'.json'));
  const verifiedBatches=[];
  for(let i=0;i<verifiedPaths.length;i+=12){
   const group=await Promise.all(verifiedPaths.slice(i,i+12).map(path=>load(path)));
   verifiedBatches.push(...group.filter(Boolean));
  }
  const textAudit=auditVerifiedTextPages({documents:docs,verifiedBatches});
  const verifiedBoundaries=[];
  for(const doc of docs)verifiedBoundaries.push(await load(root+'boundary-audit/'+doc.id+'-verified.json'));
  const boundaryAudit=auditDocumentBoundaryEvidence({documents:docs,aggregate:{documentBoundaryCandidates:verifiedBoundaries}});
  const completion=reconcileAnalysisCompletion({sourceVersion:job.documentVersion,documents:docs,sourceIndex:indexData,aggregate,report,visualReview:previous.visualReview,semanticAuditPassed:true,visualAudits,ocrVerified:textAudit.verified,boundariesVerified:boundaryAudit.verified});
  completion.failures.push(...textAudit.failures.slice(0,50),...boundaryAudit.failures.slice(0,50));
  const finalPath=root+'completion-reconciliation.json';
  await put(finalPath,JSON.stringify(completion),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  if(!completion.complete){
   await advanceJob(job,'completion_gates_pending',{...previous,semanticAuditPassed:true,semanticAuditTotal:report.findings.length,completionReconciliation:finalPath,missingGates:completion.missing},'blocked','COMPLETION_GATES_PENDING');
   return res.status(200).json({status:'blocked',reason:'COMPLETION_GATES_PENDING',missing:completion.missing});
  }
  // Newly submitted documents have passed the full verification gates.
  // Do not mark the report complete before source integrity and targeted issue checks pass.
  if(previous.delta){
   const reviewedDelta={...report,status:'reviewed',notForCourtSubmission:false,
    legalConclusionAvailable:true,independentSemanticAuditPassed:false,citationIntegrityPassed:true,
    issues:report.issues.filter(x=>x!=='INDEPENDENT_SEMANTIC_AUDIT_PENDING'),
    warning:'신규 제출자료에 한정하여 출처 무결성 검사 완료. 기존 분석과의 변경 검토 대기 중.'};
   const deltaReportPath=root+'delta-new-evidence-reviewed.json';
   const saved=await load(deltaReportPath);
   const sig=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
   if(saved&&sig(saved)!==sig(reviewedDelta))throw Error('DELTA_EVIDENCE_REPORT_CONFLICT');
   if(!saved)await put(deltaReportPath,JSON.stringify(reviewedDelta),
    {access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   await advanceJob(job,'delta_impact_review_pending',{...previous,semanticAuditPassed:true,
    delta:{...previous.delta,stage:'impact',impactCursor:0,impactPaths:[],
     revisionCursor:0,revisionPaths:[],deltaReportPath,deltaGates:completion.gates}},'retry');
   return res.status(200).json({status:'retry',stage:'delta_impact_review_pending',
    verifiedNewFindings:reviewedDelta.findings.length});
  }
  const ledgerPaths=[...(previous.legalWindowPaths||[])];
  for(const d of docs){
   for(const suffix of ['-primary.json','-independent.json']){
    const path=root+'boundary-audit/'+d.id+suffix;
    if(await load(path))ledgerPaths.push(path);
   }
   for(let page=1;page<=d.pageCount;page+=10){
    for(const kind of ['-window-','-independent-window-']){
     const path=root+'visual-provider/'+d.id+kind+String(page).padStart(8,'0')+'.json';
     if(await load(path))ledgerPaths.push(path);
    }
   }
  }
  for(let cursor=0;cursor<=Number(previous.semanticAuditCursor||0);cursor++){
   const path=root+'semantic-audit/'+String(cursor).padStart(8,'0')+'.json';
   if(await load(path))ledgerPaths.push(path);
  }
  const usageLedger=await buildCustomerUsageLedger({paths:ledgerPaths,load,sourceVersion:job.documentVersion});
  await put(root+'model-usage-ledger.json',JSON.stringify(usageLedger),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  const finalReport={...report,modelUsage:usageLedger.aggregate,usageLedger:{complete:usageLedger.complete,missingCount:usageLedger.missing.length,digest:usageLedger.ledgerDigest},status:'reviewed',notForCourtSubmission:false,legalConclusionAvailable:true,independentSemanticAuditPassed:false,citationIntegrityPassed:true,issues:report.issues.filter(x=>x!=='INDEPENDENT_SEMANTIC_AUDIT_PENDING'),warning:'원본과 검증 결과를 확인한 후 제출 여부를 결정하세요.'};
  const finalReportPath=root+'legal-customer-report-final.json';
  await put(finalReportPath,JSON.stringify(finalReport),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'analysis_completed',{...previous,semanticAuditPassed:true,completionReconciliation:finalPath,legalCustomerReport:finalReportPath,gates:completion.gates},'completed');
  return res.status(200).json({status:'completed',report:finalReportPath});
 }
 if(index===docs.length&&previous.phase==='verify'&&previous.textReviewManifest&&!previous.visualReview?.independentAuditVerified){
  if(!process.env.OPENAI_API_KEY){
   await advanceJob(job,'visual_api_key_missing',previous,'blocked','OPENAI_API_KEY_MISSING');
   return res.status(200).json({status:'blocked',reason:'OPENAI_API_KEY_MISSING'});
  }
  const next=previous.visualDocIndex||0;
  if(next<docs.length){
   const doc=docs[next];
   const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/visual-provider/';
   const startPage=previous.visualWindowStartPage||1;
   if(startPage<=doc.pageCount){
    const starts=Array.from({length:VISUAL_WINDOW_CONCURRENCY},(_,i)=>startPage+i*10)
     .filter(page=>page<=doc.pageCount);
    const cached=await Promise.all(starts.map(page=>
     load(root+doc.id+'-window-'+String(page).padStart(8,'0')+'.json')));
    const missing=starts.filter((_,i)=>!cached[i]);
    let windows=new Map();
    if(missing.length){
     const pieces=doc.sourceKind==='private_chunked_pdf_v1'?
      await splitRangeVisualWindows({
       source:{reader:createCustomerPdfRangeSource(prefix,doc),pageCount:doc.pageCount},
       sha256:doc.sha256,startPage,count:starts.length,pageCount:10
      }):await (async()=>{
       const bytes=await loadBinary(prefix+'pdf/'+doc.id+'.pdf');
       if(!bytes||createHash('sha256').update(bytes).digest('hex')!==doc.sha256)
        throw Error('VISUAL_SOURCE_PDF_DIGEST_MISMATCH');
       return splitPdfVisualWindows({pdfBytes:bytes,startPage,count:starts.length,pageCount:10});
      })();
     windows=new Map(pieces.map(piece=>[piece.startPage,piece]));
    }
    // All scheduled calls must settle before releasing this fenced lease. Every
    // successful result is written independently so partial retries reuse it.
    const settled=await Promise.allSettled(starts.map(async(page,i)=>{
     const path=root+doc.id+'-window-'+String(page).padStart(8,'0')+'.json';
     let output=cached[i];
     if(!output){
      const window=windows.get(page);
      if(!window)throw Error('VISUAL_WINDOW_SPLIT_MISSING');
      output=await timedAnalysisStep('vision_primary',()=>analyzePdfVisualEvidence({documentId:doc.id,pdfBytes:window.bytes,
       apiKey:process.env.OPENAI_API_KEY,
       model:process.env.SQUIDLAW_VISION_MODEL||'gpt-4.1-mini',
       pageOffset:page-1,windowPageCount:window.endPage-window.startPage+1,originalPdfSha256:doc.sha256}));
      if(output.sourcePdfSha256!==doc.sha256||output.documentId!==doc.id)
       throw Error('VISUAL_WINDOW_SOURCE_MISMATCH');
      await put(path,JSON.stringify(output),{access:'private',
       allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
     }
     if(output.sourcePdfSha256!==doc.sha256||output.documentId!==doc.id)
      throw Error('VISUAL_WINDOW_SOURCE_MISMATCH');
     return page;
    }));
    const failed=settled.find(item=>item.status==='rejected');
    if(failed)throw failed.reason;
    const nextPage=starts.at(-1)+10;
    await advanceJob(job,'visual_provider_window_checkpoint',
     {...previous,visualDocIndex:next,visualWindowStartPage:nextPage},'retry');
    return res.status(200).json({status:'retry',stage:'visual_provider_window_checkpoint',
     document:next+1,processedWindowStarts:starts,nextPage,recoveryPages:completedRecoveryPages(Math.min(nextPage-1,doc.pageCount),doc.pageCount)});
   }
   const windows=[];
   for(let page=1;page<=doc.pageCount;page+=10){
    const output=await load(root+doc.id+'-window-'+String(page).padStart(8,'0')+'.json');
    if(!output)throw Error('VISUAL_WINDOW_MISSING');
    windows.push(output);
   }
   const merged=mergeVisualWindows({documentId:doc.id,sourcePdfSha256:doc.sha256,pageCount:doc.pageCount,windows});
   const path=root+doc.id+'.json';
   const old=await load(path);
   if(old&&JSON.stringify(old)!==JSON.stringify(merged))throw Error('VISUAL_MERGE_CONFLICT');
   if(!old)await put(path,JSON.stringify(merged),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   await advanceJob(job,'visual_provider_checkpoint',{...previous,visualDocIndex:next+1,visualWindowStartPage:1},'retry');
   return res.status(200).json({status:'retry',stage:'visual_provider_checkpoint',processedDocuments:next+1,totalDocuments:docs.length});
  }
  if(!previous.visualSourceCoveragePassed){
  const auditFailures=[];
  for(const doc of docs){
   const outputPath='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/visual-provider/'+doc.id+'.json';
   const providerResult=await load(outputPath);
   const extractedPages=[];
   const verifiedStarts=Array.from({length:Math.ceil(doc.pageCount/20)},(_,i)=>i*20);
   for(let i=0;i<verifiedStarts.length;i+=12){
    const group=verifiedStarts.slice(i,i+12);
    const batches=await Promise.all(group.map(start=>load(prefix+'verified/'+doc.id+'/batch-'+String(start).padStart(8,'0')+'.json')));
    for(const batch of batches){
     if(!batch?.pages||batch.documentId!==doc.id||batch.sourcePdfSha256!==doc.sha256)throw Error('VISUAL_AUDIT_VERIFIED_BATCH_MISSING');
     extractedPages.push(...batch.pages);
    }
   }
   const audit=auditVisualProviderCoverage({documentId:doc.id,sourcePdfSha256:doc.sha256,pageCount:doc.pageCount,providerResult,extractedPages});
   if(!audit.complete)auditFailures.push({documentId:doc.id,failures:audit.failures.slice(0,25)});
  }
  if(auditFailures.length){
   await advanceJob(job,'visual_source_audit_failed',{...previous,visualAuditFailures:auditFailures},'blocked','VISUAL_SOURCE_AUDIT_FAILED');
   return res.status(200).json({status:'blocked',reason:'VISUAL_SOURCE_AUDIT_FAILED',failedDocuments:auditFailures.length});
  }
  await advanceJob(job,'visual_source_coverage_completed',{...previous,visualSourceCoveragePassed:true},'retry');
  return res.status(200).json({status:'retry',stage:'visual_source_coverage_completed'});
  }
  // Finalize the verified source audit exactly once; the next invocation proceeds.
  if(!previous.visualReview?.verified){
   const visualReview={verified:true,independentAuditVerified:false,sourceVersion:job.documentVersion,verifiedDocumentCount:docs.length};
   await advanceJob(job,'visual_source_audit_completed',{...previous,visualReview},'retry');
   return res.status(200).json({status:'retry',stage:'visual_source_audit_completed'});
  }
 }
 if(index===docs.length&&extractionOnly){
  await advanceJob(job,'source_collection_completed',{phase:'analyze',nextDocument:0,nextPage:0,documentCount:docs.length,collectionCompletedAt:new Date().toISOString(),...(previous.delta?{delta:previous.delta}:{})},'retry');
  return res.status(200).json({status:'retry',stage:'source_collection_completed',documents:docs.length});
 }
 if(index>=docs.length){
  if(!previous.textReviewManifest||!previous.textReviewAggregate||!(await load(previous.textReviewManifest))||!(await load(previous.textReviewAggregate))){
   await advanceJob(job,'text_review_checkpoint_incomplete',{...previous,documentCount:docs.length},'blocked','TEXT_REVIEW_AGGREGATION_MISSING');
   return res.status(200).json({status:'blocked',reason:'TEXT_REVIEW_AGGREGATION_MISSING'});
  }
  await advanceJob(job,'awaiting_visual_verification',{...previous,documentCount:docs.length},'blocked','VISUAL_EVIDENCE_NOT_VERIFIED');
  return res.status(200).json({status:'blocked',reason:'VISUAL_EVIDENCE_NOT_VERIFIED'});
 }
 const d=docs[index],extractionPath=prefix+'extracted/'+d.id+'.json';
 const e=await load(extractionPath);
 if(extractionOnly&&e){
  if(e.pageCount!==undefined&&e.pageCount!==d.pageCount)throw Error('EXTRACTION_PAGE_COUNT_MISMATCH');
  await advanceJob(job,'source_collection_checkpoint',{...previous,phase:'extract',nextDocument:index+1,nextPage:0,documentCount:docs.length},'retry');
  return res.status(200).json({status:'retry',stage:'source_collection_checkpoint',collectedDocuments:index+1,totalDocuments:docs.length});
 }

 if(!e&&d.status==='extraction_pending'){
  const start=previous.nextDocument===index?(previous.extractionNextPage??1):1;
  if(!Number.isSafeInteger(start)||start<1||start>d.pageCount||((start-1)%20)!==0)throw Error('INVALID_EXTRACTION_CHECKPOINT');
  const extractionWindow=d.sourceKind==='private_chunked_pdf_v1'?20:choosePdfExtractionWindow(d.size);
  const extracted=await extractCustomerPdfWindow(prefix,d,{
   startPage:start,pageCount:extractionWindow
  });
  if(extracted.totalPages!==d.pageCount||extracted.pages.length!==Math.min(extractionWindow,d.pageCount-start+1))throw Error('PDF_EXTRACTION_PAGE_MISMATCH');
  for(const page of extracted.pages)page.textSha256=createHash('sha256').update(String(page.text||'')).digest('hex');
  const extractedReadable=(previous.nextDocument===index?previous.extractionReadablePages||0:0)+extracted.pages.filter(p=>String(p.text||'').trim().length>=15).length;
  const extractedImagePages=(previous.nextDocument===index?previous.extractionImageOperatorPages||0:0)+extracted.pages.filter(p=>p.imageOperatorCount>0).length;
  const extractedUnscannedPages=(previous.nextDocument===index?previous.extractionUnscannedVisualPages||0:0)+extracted.pages.filter(p=>p.imageOperatorCount===null).length;
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for(let i=0;i<extracted.pages.length;i+=20){
   const batchPath=prefix+'extracted/'+d.id+'/batch-'+String(start-1+i).padStart(8,'0')+'.json';
   const payload={documentId:d.id,sourcePdfSha256:d.sha256,pageStart:start+i,pages:extracted.pages.slice(i,i+20)},old=await load(batchPath);
   if(old&&digest(old)!==digest(payload))throw Error('EXTRACTION_BATCH_CONFLICT');
   if(!old)await put(batchPath,JSON.stringify(payload),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  }
  if(!extracted.finished){
   await advanceJob(job,'pdf_extraction_checkpoint',{...previous,...(extractionOnly?{phase:'extract'}:{}),nextDocument:index,nextPage:0,extractionNextPage:start+extracted.pages.length,extractionReadablePages:extractedReadable,extractionImageOperatorPages:extractedImagePages,extractionUnscannedVisualPages:extractedUnscannedPages},'retry');
   return res.status(200).json({status:'retry',stage:'pdf_extraction_checkpoint',extractedPages:start+extracted.pages.length-1,totalPages:d.pageCount});
  }
  const batches=Array.from({length:Math.ceil(d.pageCount/20)},(_,i)=>prefix+'extracted/'+d.id+'/batch-'+String(i*20).padStart(8,'0')+'.json');
  const existingPaths=[];let extractionCursor;
  do{const listing=await blob.list({prefix:prefix+'extracted/'+d.id+'/',limit:1000,...(extractionCursor?{cursor:extractionCursor}:{})});existingPaths.push(...listing.blobs.map(x=>x.pathname));extractionCursor=listing.hasMore?listing.cursor:null}while(extractionCursor);
  if(!auditTextReviewOutputs({expected:batches,actual:existingPaths}).complete)throw Error('EXTRACTION_BATCH_MISSING');
  await put(extractionPath,JSON.stringify({documentId:d.id,sourcePdfSha256:d.sha256,pageCount:d.pageCount,batches}),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  await put(prefix+'docs/'+d.id+'.json',JSON.stringify({...d,status:'extraction_complete',extractedPages:d.pageCount,excludedPages:0,pendingPages:0,readablePages:extractedReadable,imageOperatorPages:extractedImagePages,unscannedVisualPages:extractedUnscannedPages,extractionNextPage:null}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'pdf_extraction_completed',{...previous,...(extractionOnly?{phase:'extract'}:{}),nextDocument:index,nextPage:0,extractionNextPage:null},'retry');
  return res.status(200).json({status:'retry',stage:'pdf_extraction_completed',totalPages:d.pageCount});
 }

 if(!e||(Array.isArray(e.pages)?e.pages.length!==d.pageCount:e.pageCount!==d.pageCount||!Array.isArray(e.batches))){
  await advanceJob(job,'extraction_incomplete',{...previous,nextDocument:index,documentId:d.id},'blocked','PAGE_EXTRACTION_INCOMPLETE');
  return res.status(200).json({status:'blocked',reason:'PAGE_EXTRACTION_INCOMPLETE'});
 }
 if(!Array.isArray(e.pages))assertBatchManifest({batches:e.batches,pageCount:d.pageCount});
 if(!Array.isArray(e.pages)&&e.sourcePdfSha256&&e.sourcePdfSha256!==d.sha256)throw Error('EXTRACTION_SOURCE_VERSION_MISMATCH');
 if(previous.nextDocument===index&&previous.nextPage!==undefined&&!Number.isSafeInteger(previous.nextPage))throw Error('INVALID_PAGE_CHECKPOINT');
 const pageOffset=previous.nextDocument===index?(previous.nextPage??0):0;
 if(pageOffset<0||pageOffset>=d.pageCount||pageOffset%20!==0)throw Error('INVALID_CHECKPOINT_OFFSET');
 const batchIndex=Math.floor(pageOffset/20);
 const batchPath=Array.isArray(e.pages)?null:e.batches[batchIndex];
 if(!Array.isArray(e.pages)&&typeof batchPath!=='string')throw Error('MISSING_EXTRACTION_BATCH');
 if(batchPath&&(!batchPath.startsWith(prefix+'extracted/'+d.id+'/')||!batchPath.endsWith('.json')))throw Error('INVALID_EXTRACTION_PATH');
 const batch=Array.isArray(e.pages)?null:await load(batchPath);
 const selectedPages=Array.isArray(e.pages)?e.pages.slice(pageOffset,pageOffset+20):batch?.pages;
 if(e.sourcePdfSha256&&e.sourcePdfSha256!==d.sha256)throw Error('EXTRACTION_MANIFEST_SOURCE_MISMATCH');
 if(batch?.sourcePdfSha256&&batch.sourcePdfSha256!==d.sha256)throw Error('EXTRACTION_BATCH_SOURCE_MISMATCH');
 if(batch?.documentId&&batch.documentId!==d.id)throw Error('EXTRACTION_BATCH_DOCUMENT_MISMATCH');
 if(batch?.pageStart&&batch.pageStart!==pageOffset+1)throw Error('EXTRACTION_BATCH_OFFSET_MISMATCH');
 let batchIntegrity;try{batchIntegrity=assertPageBatch({pages:selectedPages,pageOffset,pageCount:d.pageCount})}catch{
  await advanceJob(job,'page_sequence_invalid',{...previous,nextDocument:index,documentId:d.id},'blocked','INVALID_PAGE_SEQUENCE');
  return res.status(200).json({status:'blocked',reason:'INVALID_PAGE_SEQUENCE'});
 }
 if(selectedPages.length===0)throw Error('EMPTY_PAGE_BATCH');
 // Legacy extracted pages can predate page digests. Re-derive them only from the
 // original, SHA-256-verified PDF; never trust or silently rewrite stale text.
 let verifiedPages=selectedPages;
 let digestAudit=verifyPageDigests(verifiedPages,{requireDigests:true});
 if(!digestAudit.complete&&digestAudit.failures.every(f=>f.reason==='MISSING_TEXT_HASH'||f.reason==='MISSING_VISUAL_OPERATOR_DIGEST')){
  const cached=await load(prefix+'verified/'+d.id+'/batch-'+String(pageOffset).padStart(8,'0')+'.json');
  if(cached){
   if(cached.documentId!==d.id||cached.sourcePdfSha256!==d.sha256||!Array.isArray(cached.pages)||cached.pages.length!==selectedPages.length)throw Error('VERIFIED_CACHE_SOURCE_MISMATCH');
   if(!selectedPages.every((p,i)=>p.page===cached.pages[i].page&&String(p.text??'')===String(cached.pages[i].text??'')))throw Error('VERIFIED_CACHE_TEXT_MISMATCH');
   const cachedAudit=verifyPageDigests(cached.pages,{requireDigests:true});
   if(!cachedAudit.complete)throw Error('VERIFIED_CACHE_DIGEST_MISMATCH');
   verifiedPages=cached.pages;digestAudit=cachedAudit;
  }
 }
 if(!digestAudit.complete&&digestAudit.failures.every(f=>f.reason==='MISSING_TEXT_HASH'||f.reason==='MISSING_VISUAL_OPERATOR_DIGEST')){
  const regenerated=await extractCustomerPdfWindow(prefix,d,{
   startPage:pageOffset+1,pageCount:selectedPages.length
  });
  if(regenerated.totalPages!==d.pageCount||regenerated.pages.length!==selectedPages.length)throw Error('SOURCE_PAGE_REEXTRACTION_MISMATCH');
  const sameSource=selectedPages.every((oldPage,i)=>{
   const fresh=regenerated.pages[i];
   return oldPage.page===fresh.page&&String(oldPage.text??'')===fresh.text
    &&(oldPage.imageOperatorCount===undefined||oldPage.imageOperatorCount===fresh.imageOperatorCount)
    &&(oldPage.visualInventoryStatus===undefined||oldPage.visualInventoryStatus===fresh.visualInventoryStatus)
    &&(oldPage.visualOperatorDigest===undefined||oldPage.visualOperatorDigest===fresh.visualOperatorDigest);
  });
  if(sameSource){
   verifiedPages=regenerated.pages.map((p,i)=>({...selectedPages[i],...p,textSha256:createHash('sha256').update(String(p.text??'')).digest('hex')}));
   digestAudit=verifyPageDigests(verifiedPages,{requireDigests:true});
  }
 }
 if(!digestAudit.complete){await advanceJob(job,'source_digest_mismatch',{...previous,nextDocument:index,nextPage:pageOffset,failures:digestAudit.failures.slice(0,20)},'blocked','SOURCE_DIGEST_MISMATCH');return res.status(200).json({status:'blocked',reason:'SOURCE_DIGEST_MISMATCH'})}
 // Recover only genuinely scanned text pages. Each model pass is separately persisted
 // so a retry cannot silently duplicate an already completed API call.
 const missingOcr=verifiedPages.filter(p=>!String(p.text||'').trim()&&Number(p.imageOperatorCount)>0);
 // Reuse existing independently verified OCR receipts before generating anything.
 const completedOcr=await Promise.all(missingOcr.map(async page=>{
  const base=prefix+'ocr/'+d.id+'/page-'+String(page.page).padStart(8,'0');
  return {page,done:await load(base+'-verified.json')};
 }));
 const pendingOcr=[];
 for(const {page,done} of completedOcr){
  if(!done){pendingOcr.push(page);continue}
  if(done.sourcePdfSha256!==d.sha256||done.page!==page.page||
   done.originalTextSha256!==page.textSha256||
   typeof done.text!=='string'||!done.text.trim())
   throw Error('OCR_CACHE_SOURCE_MISMATCH');
  const i=verifiedPages.findIndex(p=>p.page===page.page);
  verifiedPages=[...verifiedPages];
  verifiedPages[i]={...page,text:done.text,
   textSha256:createHash('sha256').update(done.text).digest('hex'),
   ocrRecovered:true,ocrVerified:true,ocrSourcePdfSha256:d.sha256};
 }
 if(pendingOcr.length){
  if(!process.env.OPENAI_API_KEY){
   await advanceJob(job,'ocr_api_missing',
    {...previous,nextDocument:index,nextPage:pageOffset},'blocked','OPENAI_API_KEY_MISSING');
   return res.status(200).json({status:'blocked',reason:'OPENAI_API_KEY_MISSING'});
  }
  const selected=pendingOcr.slice(0,VISUAL_WINDOW_CONCURRENCY);
  const windows=d.sourceKind==='private_chunked_pdf_v1'?
   await splitRangeVisualPageSet({
    source:{reader:createCustomerPdfRangeSource(prefix,d),pageCount:d.pageCount},
    sha256:d.sha256,pages:selected.map(page=>page.page)
   }):await (async()=>{
    const source=await loadBinary(prefix+'pdf/'+d.id+'.pdf');
    if(!source||createHash('sha256').update(source).digest('hex')!==d.sha256)
     throw Error('OCR_PDF_SOURCE_MISMATCH');
    return splitPdfVisualPageSet({pdfBytes:source,pages:selected.map(page=>page.page)});
   })();
  // Each page still requires BOTH independent image/model passes and strict
  // reconciliation. Only unrelated pages run concurrently.
  const settled=await Promise.allSettled(selected.map(async(page,i)=>{
   const base=prefix+'ocr/'+d.id+'/page-'+String(page.page).padStart(8,'0');
   const pdfWindow=windows[i];
   if(!pdfWindow||pdfWindow.startPage!==page.page||
    pdfWindow.originalSha256!==d.sha256)throw Error('OCR_WINDOW_SOURCE_MISMATCH');
   const primaryPath=base+'-primary.json',secondPath=base+'-independent.json';
   let primary=await load(primaryPath);
   if(!primary){
    primary=await timedAnalysisStep('vision_primary',()=>analyzePdfVisualEvidence({documentId:d.id,pdfBytes:pdfWindow.bytes,
     apiKey:process.env.OPENAI_API_KEY,
     model:process.env.SQUIDLAW_VISION_MODEL||'gpt-4.1-mini',
     pageOffset:page.page-1,windowPageCount:1,originalPdfSha256:d.sha256}));
    await put(primaryPath,JSON.stringify(primary),{access:'private',
     allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   }
   if(primary.sourcePdfSha256!==d.sha256||primary.documentId!==d.id)
    throw Error('OCR_PRIMARY_SOURCE_MISMATCH');
   let secondary=await load(secondPath);
   if(!secondary){
    secondary=await timedAnalysisStep('vision_primary',()=>analyzePdfVisualEvidence({documentId:d.id,pdfBytes:pdfWindow.bytes,
     apiKey:process.env.OPENAI_API_KEY,
     model:process.env.SQUIDLAW_VISION_MODEL||'gpt-4.1-mini',
     auditOf:primary,pageOffset:page.page-1,windowPageCount:1,originalPdfSha256:d.sha256}));
    await put(secondPath,JSON.stringify(secondary),{access:'private',
     allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   }
   if(secondary.sourcePdfSha256!==d.sha256||secondary.documentId!==d.id)
    throw Error('OCR_INDEPENDENT_SOURCE_MISMATCH');
   const reconciled=reconcileVisualOcr({pages:[page],primary,
    independent:secondary,sourcePdfSha256:d.sha256});
   const recovered=reconciled.pages[0];
   if(!String(recovered?.text||'').trim())throw Error('OCR_RECOVERY_EMPTY');
   await put(base+'-verified.json',JSON.stringify({page:page.page,
    text:recovered.text,sourcePdfSha256:d.sha256,
    originalTextSha256:page.textSha256}),{access:'private',
     allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   return page.page;
  }));
  // Wait for every in-flight model request before releasing the current owner.
  // Any successful page remains in the durable store after a partial failure.
  const failed=settled.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
  await advanceJob(job,'ocr_verified_checkpoint',
   {...previous,nextDocument:index,nextPage:pageOffset},'retry');
  return res.status(200).json({status:'retry',stage:'ocr_verified_checkpoint',
   verifiedOcrPages:settled.map(x=>x.value),remainingOcrPages:pendingOcr.length-selected.length});
 }
 // Persist source-verified legacy pages once, so a resumed analysis never needs
 // to re-download and re-parse the original PDF for the same page window.
 {
  const verifiedPath=prefix+'verified/'+d.id+'/batch-'+String(pageOffset).padStart(8,'0')+'.json';
  const oldVerified=await load(verifiedPath);
  if(oldVerified){
   if(oldVerified.sourcePdfSha256!==d.sha256||oldVerified.documentId!==d.id||JSON.stringify(oldVerified.pages)!==JSON.stringify(verifiedPages))throw Error('VERIFIED_PAGE_CONFLICT');
  }else await put(verifiedPath,JSON.stringify({documentId:d.id,sourcePdfSha256:d.sha256,pages:verifiedPages}),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
 }
 const segmented=segmentRecord({scope:'customer',documentId:d.id,pages:verifiedPages});
 if(!auditSegments(verifiedPages,segmented.segments).complete)throw Error('SEGMENT_AUDIT');
 const units=segmented.segments.map(u=>({...u,filename:d.name||''}));
 const results=units.map(analyzeUnit),audit=independentlyVerify(units,results);
 const visualQueue=buildVisualWorkQueue({documentId:d.id,pages:verifiedPages,sourcePdfPath:prefix+'pdf/'+d.id+'.pdf'});
 const visualQueuePath='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/visual-queues/'+d.id+'-'+String(pageOffset).padStart(8,'0')+'.json';
 const visualReferences=buildVisualReferenceManifest({caseId:job.caseId,sourceVersion:job.documentVersion,documentId:d.id,sourcePdfSha256:d.sha256,pages:verifiedPages.map(p=>({...p,textPresent:!!String(p.text||'').trim()}))});
 if(!audit.complete){
  await put(visualQueuePath,JSON.stringify({...visualQueue,sourceVersion:job.documentVersion,visualReferences}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'ocr_required',{...previous,nextDocument:index,documentId:d.id,missing:audit.missing.slice(0,100)},'blocked','OCR_REQUIRED');
  return res.status(200).json({status:'blocked',reason:'OCR_REQUIRED'});
 }
 const output='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/'+d.id+'-'+String(pageOffset).padStart(8,'0')+'.json';
 const visualPlan=planVisualEvidence({documentId:d.id,pages:verifiedPages,images:[]});
 if(visualQueue.taskCount)await put(visualQueuePath,JSON.stringify({...visualQueue,sourceVersion:job.documentVersion,visualReferences}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
 const payload={documentId:d.id,sourceVersion:job.documentVersion,unitCount:units.length,pageCount:verifiedPages.length,pageStart:pageOffset+1,verifiedText:true,visualVerified:false,visualPlan,visualWorkQueuePath:visualQueue.taskCount?visualQueuePath:null,visualInventoryComplete:false,documentBoundaryCandidates:candidateDocuments(verifiedPages.map(p=>({...p,documentId:d.id,filename:d.name}))),results};
 const existing=await load(output);
 if(existing){
  if(existing.sourceVersion!==job.documentVersion)throw Error('RESULT_VERSION_MISMATCH');
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if(hash(existing)!==hash(payload)){
   await advanceJob(job,'persisted_batch_conflict',{...previous,nextDocument:index,nextPage:pageOffset,documentId:d.id},'blocked','PERSISTED_BATCH_CONFLICT');
   return res.status(200).json({status:'blocked',reason:'PERSISTED_BATCH_CONFLICT'});
  }
 }else await put(output,JSON.stringify(payload),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
 const finished=batchIntegrity.finished;
 const checkpoint={nextDocument:finished?index+1:index,nextPage:finished?0:pageOffset+verifiedPages.length,recoveryPages:completedRecoveryPages(pageOffset+verifiedPages.length,d.pageCount),documentCount:docs.length,lastDocumentId:d.id,lastOutput:output,verifiedTextDocuments:finished?index+1:index,errorAttempts:0,...(previous.delta?{delta:previous.delta}:{})};
 if(finished&&index+1===docs.length){
  const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
  const expected=expectedTextReviewOutputs({root,documents:docs});
  const actual=[];let resultCursor;
  do{const page=await blob.list({prefix:root,limit:1000,...(resultCursor?{cursor:resultCursor}:{})});actual.push(...page.blobs.filter(x=>/^[^/]+-\d{8}\.json$/.test(x.pathname.slice(root.length))).map(x=>x.pathname));resultCursor=page.hasMore?page.cursor:null}while(resultCursor);
  const outputAudit=auditTextReviewOutputs({expected,actual});
  if(!outputAudit.complete){await advanceJob(job,'text_review_output_incomplete',{...checkpoint,missingOutputs:outputAudit.missing.slice(0,50)},'blocked','TEXT_REVIEW_OUTPUT_INCOMPLETE');return res.status(200).json({status:'blocked',reason:'TEXT_REVIEW_OUTPUT_INCOMPLETE'})}
  await advanceJob(job,'text_review_finalize_checkpoint',{...checkpoint,finalizeOffset:0,finalizeUnitCount:0,finalizePartDigests:[]},'retry');
  return res.status(200).json({status:'retry',stage:'text_review_finalize_checkpoint'});

 }
 await advanceJob(job,'text_review_checkpoint',checkpoint,'retry');
 return res.status(200).json({status:'retry',processedDocuments:checkpoint.verifiedTextDocuments,processedPages:checkpoint.nextPage,totalDocuments:docs.length});

 }catch(e){const diagnostic=String(e?.message||e||'UNKNOWN').slice(0,160);const safeCode=diagnostic.startsWith('GPT_LEGAL_SOURCE_REVIEW_FAILED:')?'SOURCE_READ_REVIEW_FAILED':/^[A-Z][A-Z0-9_]{2,100}$/.test(diagnostic)?diagnostic:'WORKER_ERROR';if(job){try{await advanceJob(job,'error',{...(job.checkpoint||{}),errorAttempts:Number(job.checkpoint?.errorAttempts||0)+1,lastFailedStage:job.stage||null,lastFailureCode:safeCode,lastFailureAt:new Date().toISOString(),message:diagnostic,...(safeCode==='VISION_PDF_INVALID_PAGE'?{visionPageDiagnostic:visionFailureDiagnostic(e)}:{})},visionFailureDisposition(safeCode,{attempts:Number(job.attempts||0),maxAttempts:Number(job.maxAttempts||3)}).status,safeCode)}catch{}}return res.status(503).json({error:safeCode,status:visionFailureDisposition(safeCode,{attempts:Number(job?.attempts||0),maxAttempts:Number(job?.maxAttempts||3)}).status,retryable:!!job&&visionFailureDisposition(safeCode,{attempts:Number(job.attempts||0),maxAttempts:Number(job.maxAttempts||3)}).retryable})}
 finally{if(heartbeat)clearInterval(heartbeat)}
}
