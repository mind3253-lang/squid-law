import {claimJob,advanceJob} from './customer-analysis-jobs-db.js';
import {get} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeUnit,independentlyVerify,crosscheckObservations} from '../lib/legal-evidence-review.mjs';
import {put} from '@vercel/blob';
import {candidateDocuments,mergeDocumentBoundaryCandidates} from './customer-document-boundaries.js';
import {extractPdfPages,choosePdfExtractionWindow} from './customer-pdf-extract.js';
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
import {auditVisualProviderCoverage} from '../lib/visual-review-audit.mjs';
import {buildLegalCustomerReport} from '../lib/legal-customer-report.mjs';
import {validatePersistedBatch,finalizationDescriptors,validateFinalizationPart,summarizeClaimRoles} from '../lib/text-review-aggregation.mjs';
import {detectOpposingStatements} from '../lib/case-crosscheck.mjs';
const eq=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
async function load(path){const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let size=0,parts=[];for await(const chunk of r.stream){size+=chunk.length;if(size>32*1024*1024)throw Error('BLOB_TOO_LARGE');parts.push(Buffer.from(chunk))}return JSON.parse(Buffer.concat(parts).toString())}
async function loadBinary(path,maxBytes=105*1024*1024){const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let size=0;const chunks=[];for await(const chunk of r.stream){size+=chunk.length;if(size>maxBytes)throw Error('SOURCE_PDF_TOO_LARGE');chunks.push(Buffer.from(chunk))}return Buffer.concat(chunks)}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'METHOD'});
 if(!process.env.CRON_SECRET||!eq(String(req.headers.authorization||''),'Bearer '+process.env.CRON_SECRET))return res.status(401).json({error:'UNAUTHORIZED'});
 let job;try{job=await claimJob();if(!job)return res.status(200).json({status:'idle'});
 const prefix='squidlaw/cases/'+job.customerKey+'/'+job.caseId+'/';
 const registry=await load('squidlaw/cases/'+job.customerKey+'/registry/'+job.caseId+'.json');
 if(!registry||registry.id!==job.caseId)throw Error('CASE_NOT_FOUND');
 // Never mark complete before OCR, image evidence, cross-document reasoning and independent verification have passed.
 const blob=(await import('@vercel/blob'));let cursor,paths=[];do{const listing=await blob.list({prefix:prefix+'docs/',limit:1000,...(cursor?{cursor}:{})});paths.push(...listing.blobs.filter(b=>b.pathname.endsWith('.json')).map(b=>b.pathname));cursor=listing.hasMore?listing.cursor:null}while(cursor);
 const meta=[];for(let i=0;i<paths.length;i+=12)meta.push(...await Promise.all(paths.slice(i,i+12).map(p=>load(p))));
 if(meta.some(x=>!x))throw Error('DOCUMENT_METADATA_MISSING');
 if(meta.some(x=>!x.id||!Number.isSafeInteger(x.pageCount)||x.pageCount<1||!/^[a-f0-9]{64}$/.test(x.sha256||'')))throw Error('DOCUMENT_METADATA_INVALID');
 if(new Set(meta.map(x=>x.id)).size!==meta.length)throw Error('DUPLICATE_DOCUMENT_METADATA');
 if(meta.length===0)throw Error('EMPTY_CASE_DOCUMENTS');
 const docs=meta.sort((a,b)=>a.id.localeCompare(b.id)),version=createHash('sha256').update(JSON.stringify(docs.map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 if(version!==job.documentVersion){await advanceJob(job,'source_changed',{expected:job.documentVersion,actual:version},'blocked','SOURCE_VERSION_CHANGED');return res.status(200).json({status:'blocked',reason:'SOURCE_VERSION_CHANGED'})}

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
  if(offset<0||offset>descriptors.length||offset%8!==0&&offset!==descriptors.length)throw Error('INVALID_FINALIZATION_CHECKPOINT');
  if(offset<descriptors.length){
   let cursor=offset,countTotal=previous.finalizeUnitCount||0;
   const digests=[...(previous.finalizePartDigests||[])];
   const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
   for(let round=0;round<8&&cursor<descriptors.length;round++){
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
  for(let start=0;start<descriptors.length;start+=8){
   const part=await load(root+'finalize-parts/'+String(start).padStart(8,'0')+'.json');
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
  const documentBoundaryCandidates=docs.map(d=>mergeDocumentBoundaryCandidates({documentId:d.id,pageCount:d.pageCount,batches:boundaries.filter(x=>x.documentId===d.id)}));
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
  const legalRequest=buildLegalReasoningRequest({caseId:job.caseId,sourceVersion:job.documentVersion,aggregatePath,aggregateSha256,sourceIndexPath,sourceIndexSha256,partPaths,partDigests:previous.finalizePartDigests});
  await put(legalReasoningRequestPath,JSON.stringify(legalRequest),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await put(manifestPath,JSON.stringify({caseId:job.caseId,sourceVersion:job.documentVersion,documents:docs.map(x=>({id:x.id,pageCount:x.pageCount})),outputs:expectedTextReviewOutputs({root,documents:docs}),aggregateSha256,verifiedVisual:false,verifiedLegal:false,analysisComplete:false,pendingStages:ANALYSIS_STAGES.slice(2)}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'text_review_completed_visual_pending',{...previous,phase:'verify',textReviewManifest:manifestPath,textReviewAggregate:aggregatePath,textReviewIntermediateReport:intermediateReportPath,legalReasoningRequest:legalReasoningRequestPath,sourceUnitIndex:sourceIndexPath},'retry');
  return res.status(200).json({status:'retry',stage:'text_review_completed_visual_pending',verifiedTextDocuments:docs.length});
 }
 if(index>=docs.length&&previous.visualReview?.verified===true&&previous.visualReview?.independentAuditVerified===true&&previous.visualReview?.sourceVersion===job.documentVersion&&previous.legalReasoningRequest&&previous.sourceUnitIndex){
  const root='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
  const request=await load(previous.legalReasoningRequest);
  const sourceIndex=await load(previous.sourceUnitIndex);
  if(!request||!sourceIndex||sourceIndex.sourceVersion!==job.documentVersion||request.sourceVersion!==job.documentVersion)throw Error('LEGAL_SOURCE_VERSION_MISMATCH');
  if(process.env.SQUIDLAW_LEGAL_API_ENABLED!=='true'||!process.env.OPENAI_API_KEY){
   await advanceJob(job,'legal_api_approval_pending',previous,'blocked','LEGAL_API_NOT_ENABLED');
   return res.status(200).json({status:'blocked',reason:'LEGAL_API_NOT_ENABLED'});
  }
  const authorized={...request,ready:true,status:'authorized_after_visual_review'};
  const task=authorized.requestedTasks?.[previous.legalTaskIndex||0];
  if(!task)throw Error('INVALID_LEGAL_TASK');
  const cursor=previous.legalCursor||0;
  const units=[];
  // Rehydrate only the requested source window from original extracted text.
  for(const d of docs){
   for(let start=0;start<d.pageCount;start+=20){
    const extracted=await load(prefix+'extracted/'+d.id+'/batch-'+String(start).padStart(8,'0')+'.json');
    if(!extracted?.pages)throw Error('LEGAL_SOURCE_TEXT_MISSING');
    const segments=segmentRecord({scope:'customer',documentId:d.id,pages:extracted.pages}).segments;
    for(const u of segments)if(u.part>0)units.push({documentId:d.id,page:u.page,part:u.part,hash:u.hash,text:u.text});
   }
  }
  const indexed=new Map(sourceIndex.sources.map(x=>[x.documentId+':'+x.page+':'+x.part,x.hash]));
  if(units.length!==sourceIndex.sources.length||units.some(u=>indexed.get(u.documentId+':'+u.page+':'+u.part)!==u.hash))throw Error('LEGAL_SOURCE_REHYDRATION_MISMATCH');
  const part=await analyzeLegalWindow({request:authorized,sourceUnits:units,cursor,task,apiKey:process.env.OPENAI_API_KEY,model:process.env.SQUIDLAW_LEGAL_MODEL||'gpt-5.4'});
  const path=root+'legal-windows/'+String(previous.legalTaskIndex||0).padStart(2,'0')+'-'+String(cursor).padStart(8,'0')+'.json';
  const existing=await load(path);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(part))throw Error('LEGAL_WINDOW_CONFLICT');
  if(!existing)await put(path,JSON.stringify(part),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  const paths=[...(previous.legalWindowPaths||[]),path];
  const nextTask=part.complete?(previous.legalTaskIndex||0)+1:(previous.legalTaskIndex||0);
  const nextCursor=part.complete?0:part.nextCursor;
  if(nextTask<authorized.requestedTasks.length){
   await advanceJob(job,'legal_reasoning_checkpoint',{...previous,legalTaskIndex:nextTask,legalCursor:nextCursor,legalWindowPaths:paths},'retry');
   return res.status(200).json({status:'retry',stage:'legal_reasoning_checkpoint',task:nextTask,cursor:nextCursor});
  }
  const windows=await Promise.all(paths.map(p=>load(p)));
  // Each task restarts its cursor; build a report per task and keep all outputs as unverified.
  const reports=authorized.requestedTasks.map(t=>buildLegalCustomerReport({request:authorized,windows:windows.filter(w=>w.task===t),sourceIndex:sourceIndex.sources}));
  const report={...reports[0],findings:reports.flatMap(r=>r.findings),uncertainties:reports.flatMap(r=>r.uncertainties),issues:[...new Set(reports.flatMap(r=>r.issues))],sourceCoverage:{tasks:reports.length,processedUnits:units.length},status:'draft_pending_verification',notForCourtSubmission:true,legalConclusionAvailable:false,independentSemanticAuditPassed:false};
  const reportPath=root+'legal-customer-report.json';
  await put(reportPath,JSON.stringify(report),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'legal_reasoning_independent_review_pending',{...previous,legalTaskIndex:nextTask,legalCursor:0,legalWindowPaths:paths,legalCustomerReport:reportPath},'blocked','INDEPENDENT_SEMANTIC_AUDIT_PENDING');
  return res.status(200).json({status:'blocked',reason:'INDEPENDENT_SEMANTIC_AUDIT_PENDING'});
 }
 if(index===docs.length&&previous.phase==='verify'&&previous.textReviewManifest&&!previous.visualReview?.independentAuditVerified){
  if(!process.env.OPENAI_API_KEY){
   await advanceJob(job,'visual_api_key_missing',previous,'blocked','OPENAI_API_KEY_MISSING');
   return res.status(200).json({status:'blocked',reason:'OPENAI_API_KEY_MISSING'});
  }
  const next=previous.visualDocIndex||0;
  if(next<docs.length){
   const doc=docs[next];
   const outputPath='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/visual-provider/'+doc.id+'.json';
   let output=await load(outputPath);
   if(!output){
    const bytes=await loadBinary(prefix+'pdf/'+doc.id+'.pdf');
    if(!bytes||createHash('sha256').update(bytes).digest('hex')!==doc.sha256)throw Error('VISUAL_SOURCE_PDF_DIGEST_MISMATCH');
    output=await analyzePdfVisualEvidence({documentId:doc.id,pdfBytes:bytes,apiKey:process.env.OPENAI_API_KEY,model:process.env.SQUIDLAW_VISION_MODEL||'gpt-4.1-mini'});
    await put(outputPath,JSON.stringify(output),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
   }
   if(output.sourcePdfSha256!==doc.sha256||output.documentId!==doc.id||!Array.isArray(output.observations?.pageObservations)||!Array.isArray(output.observations?.unreviewedPages))throw Error('VISUAL_PROVIDER_SOURCE_MISMATCH');
   const reviewed=output.observations.pageObservations.map(p=>p.page),unreviewed=output.observations.unreviewedPages;
   if([...reviewed,...unreviewed].some(p=>!Number.isSafeInteger(p)||p<1||p>doc.pageCount)||new Set([...reviewed,...unreviewed]).size!==reviewed.length+unreviewed.length)throw Error('VISUAL_PROVIDER_PAGE_REFERENCE_INVALID');
   await advanceJob(job,'visual_provider_checkpoint',{...previous,visualDocIndex:next+1,visualProviderLastOutput:outputPath},'retry');
   return res.status(200).json({status:'retry',stage:'visual_provider_checkpoint',processedDocuments:next+1,totalDocuments:docs.length});
  }
  const auditFailures=[];
  for(const doc of docs){
   const outputPath='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/visual-provider/'+doc.id+'.json';
   const providerResult=await load(outputPath);
   const extractedPages=[];
   for(let start=0;start<doc.pageCount;start+=20){
    const batch=await load(prefix+'extracted/'+doc.id+'/batch-'+String(start).padStart(8,'0')+'.json');
    if(!batch?.pages)throw Error('VISUAL_AUDIT_EXTRACTED_BATCH_MISSING');
    extractedPages.push(...batch.pages);
   }
   const audit=auditVisualProviderCoverage({documentId:doc.id,sourcePdfSha256:doc.sha256,pageCount:doc.pageCount,providerResult,extractedPages});
   if(!audit.complete)auditFailures.push({documentId:doc.id,failures:audit.failures.slice(0,25)});
  }
  if(auditFailures.length){
   await advanceJob(job,'visual_source_audit_failed',{...previous,visualAuditFailures:auditFailures},'blocked','VISUAL_SOURCE_AUDIT_FAILED');
   return res.status(200).json({status:'blocked',reason:'VISUAL_SOURCE_AUDIT_FAILED',failedDocuments:auditFailures.length});
  }
  // Source coverage is a prerequisite, not an independent visual meaning audit.
  // Do not authorize legal reasoning until an independent source-backed review exists.
  await advanceJob(job,'visual_independent_audit_pending',{...previous,visualProviderCompleted:true,phase:'verify'},'blocked','INDEPENDENT_VISUAL_AUDIT_PENDING');
  return res.status(200).json({status:'blocked',reason:'INDEPENDENT_VISUAL_AUDIT_PENDING'});
 }
 if(index===docs.length&&extractionOnly){
  await advanceJob(job,'source_collection_completed',{phase:'analyze',nextDocument:0,nextPage:0,documentCount:docs.length,collectionCompletedAt:new Date().toISOString()},'retry');
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
  const bytes=await loadBinary(prefix+'pdf/'+d.id+'.pdf');
  if(!bytes||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('SOURCE_PDF_DIGEST_MISMATCH');
  const extractionWindow=choosePdfExtractionWindow(d.size);
  const extracted=await extractPdfPages(bytes,{startPage:start,pageCount:extractionWindow});
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
  const source=await loadBinary(prefix+'pdf/'+d.id+'.pdf');
  if(!source||createHash('sha256').update(source).digest('hex')!==d.sha256)throw Error('SOURCE_PDF_DIGEST_MISMATCH');
  const regenerated=await extractPdfPages(source,{startPage:pageOffset+1,pageCount:selectedPages.length});
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
 // Persist source-verified legacy pages once, so a resumed analysis never needs
 // to re-download and re-parse the original PDF for the same page window.
 if(verifiedPages!==selectedPages){
  const verifiedPath=prefix+'verified/'+d.id+'/batch-'+String(pageOffset).padStart(8,'0')+'.json';
  const oldVerified=await load(verifiedPath);
  if(oldVerified){
   if(JSON.stringify(oldVerified.pages)!==JSON.stringify(verifiedPages))throw Error('VERIFIED_PAGE_CONFLICT');
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
 const checkpoint={nextDocument:finished?index+1:index,nextPage:finished?0:pageOffset+verifiedPages.length,documentCount:docs.length,lastDocumentId:d.id,lastOutput:output,verifiedTextDocuments:finished?index+1:index,errorAttempts:0};
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

 }catch(e){if(job){try{await advanceJob(job,'error',{...(job.checkpoint||{}),errorAttempts:Number(job.checkpoint?.errorAttempts||0)+1,message:String(e.message||e).slice(0,250)},(Number(job.attempts||0)+1)>=job.maxAttempts?'failed':'retry','WORKER_ERROR')}catch{}}return res.status(503).json({error:'WORKER_ERROR'})}
}
