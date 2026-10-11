import {claimJob,advanceJob} from './customer-analysis-jobs-db.js';
import {get} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeUnit,independentlyVerify,crosscheckObservations} from '../lib/legal-evidence-review.mjs';
import {put} from '@vercel/blob';
import {candidateDocuments,mergeDocumentBoundaryCandidates} from './customer-document-boundaries.js';
import {extractPdfPages} from './customer-pdf-extract.js';
import {planVisualEvidence} from '../lib/visual-evidence.mjs';
import {assertPageBatch,assertBatchManifest} from '../lib/batch-integrity.mjs';
import {expectedTextReviewOutputs,auditTextReviewOutputs} from '../lib/text-review-manifest.mjs';
import {verifyPageDigests} from '../lib/page-digests.mjs';
import {ANALYSIS_STAGES} from '../lib/analysis-pipeline-state.mjs';
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
 if(previous.nextDocument!==undefined&&!Number.isSafeInteger(previous.nextDocument))throw Error('INVALID_DOCUMENT_CHECKPOINT');
 const index=previous.nextDocument??0;
 if(index<0||index>docs.length)throw Error('INVALID_DOCUMENT_CHECKPOINT');
 if(index===docs.length&&previous.nextPage!==0&&previous.nextPage!==undefined)throw Error('INVALID_TERMINAL_PAGE_CHECKPOINT');
 if(index===docs.length&&Number.isSafeInteger(previous.finalizeOffset)){
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
    const claims=[],observations=[],boundaries=[];let count=0;
    for(let i=0;i<selected.length;i++){
     const x=selected[i],verified=validatePersistedBatch({batch:batches[i],documentId:x.documentId,sourceVersion:job.documentVersion,pageStart:x.start+1,pageCount:x.count});
     count+=verified.unitCount;
     for(const claim of verified.claimResults)claims.push(claim);
     for(const observation of verified.observationResults)observations.push(observation);
     boundaries.push({documentId:x.documentId,sections:batches[i].documentBoundaryCandidates?.sections});
    }
    if(digests.length!==Math.ceil(cursor/8))throw Error('INVALID_FINALIZATION_DIGEST_CHECKPOINT');
    const partPath=root+'finalize-parts/'+String(cursor).padStart(8,'0')+'.json';
    const part={sourceVersion:job.documentVersion,offset:cursor,batchCount:selected.length,unitCount:count,claims,observations,boundaries};
    const old=await load(partPath);
    if(old&&hash(old)!==hash(part))throw Error('FINALIZATION_PART_CONFLICT');
    if(!old)await put(partPath,JSON.stringify(part),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
    digests.push(hash(part));countTotal+=count;cursor+=selected.length;
   }
   await advanceJob(job,'text_review_finalize_checkpoint',{...previous,finalizeOffset:cursor,finalizeUnitCount:countTotal,finalizePartDigests:digests},'retry');
   return res.status(200).json({status:'retry',stage:'text_review_finalize_checkpoint',verifiedBatches:cursor,totalBatches:descriptors.length});
  }
  if(!Array.isArray(previous.finalizePartDigests)||previous.finalizePartDigests.length!==Math.ceil(descriptors.length/8))throw Error('FINALIZATION_DIGEST_COUNT_MISMATCH');
  const claims=[],observations=[],boundaries=[];let total=0;
  for(let start=0;start<descriptors.length;start+=8){
   const part=await load(root+'finalize-parts/'+String(start).padStart(8,'0')+'.json');
   if(!part)throw Error('FINALIZATION_PART_MISSING');
   validateFinalizationPart(part,{sourceVersion:job.documentVersion,offset:start,batchCount:Math.min(8,descriptors.length-start),sha256:previous.finalizePartDigests[Math.floor(start/8)]});
   total+=part.unitCount;
   for(const claim of part.claims)claims.push(claim);
   for(const observation of part.observations||[])observations.push(observation);
   for(const boundary of part.boundaries||[])boundaries.push(boundary);
  }
  if(total!==previous.finalizeUnitCount)throw Error('FINALIZATION_COUNT_MISMATCH');
  const documentBoundaryCandidates=docs.map(d=>mergeDocumentBoundaryCandidates({documentId:d.id,pageCount:d.pageCount,batches:boundaries.filter(x=>x.documentId===d.id)}));
  const aggregate={caseId:job.caseId,sourceVersion:job.documentVersion,coverage:docs.map(d=>({documentId:d.id,pages:d.pageCount,textBatchCount:Math.ceil(d.pageCount/20)})),observationCount:total,opposingStatementCandidates:detectOpposingStatements(claims),claimRoleSummary:summarizeClaimRoles(claims),crossDocumentEvidenceLinks:crosscheckObservations(observations),documentBoundaryCandidates,verifiedLegal:false,verifiedVisual:false,status:'awaiting_visual_and_semantic_review'};
  const aggregatePath=root+'text-review-aggregate.json',manifestPath=root+'text-review-manifest.json';
  await put(aggregatePath,JSON.stringify(aggregate),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await put(manifestPath,JSON.stringify({caseId:job.caseId,sourceVersion:job.documentVersion,documents:docs.map(x=>({id:x.id,pageCount:x.pageCount})),outputs:expectedTextReviewOutputs({root,documents:docs}),verifiedVisual:false,verifiedLegal:false,analysisComplete:false,pendingStages:ANALYSIS_STAGES.slice(2)}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'text_review_completed_visual_pending',{...previous,textReviewManifest:manifestPath,textReviewAggregate:aggregatePath},'blocked','VISUAL_EVIDENCE_NOT_VERIFIED');
  return res.status(200).json({status:'blocked',reason:'VISUAL_EVIDENCE_NOT_VERIFIED',verifiedTextDocuments:docs.length});
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
 if(!e&&d.status==='extraction_pending'){
  const start=previous.nextDocument===index?(previous.extractionNextPage??1):1;
  if(!Number.isSafeInteger(start)||start<1||start>d.pageCount||((start-1)%20)!==0)throw Error('INVALID_EXTRACTION_CHECKPOINT');
  const bytes=await loadBinary(prefix+'pdf/'+d.id+'.pdf');
  if(!bytes||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('SOURCE_PDF_DIGEST_MISMATCH');
  const extracted=await extractPdfPages(bytes,{startPage:start,pageCount:20});
  if(extracted.totalPages!==d.pageCount||extracted.pages.length!==Math.min(20,d.pageCount-start+1))throw Error('PDF_EXTRACTION_PAGE_MISMATCH');
  for(const page of extracted.pages)page.textSha256=createHash('sha256').update(String(page.text||'')).digest('hex');
  const batchPath=prefix+'extracted/'+d.id+'/batch-'+String(start-1).padStart(8,'0')+'.json';
  const payload={pages:extracted.pages},old=await load(batchPath);
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if(old&&digest(old)!==digest(payload))throw Error('EXTRACTION_BATCH_CONFLICT');
  if(!old)await put(batchPath,JSON.stringify(payload),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  if(!extracted.finished){
   await advanceJob(job,'pdf_extraction_checkpoint',{...previous,nextDocument:index,nextPage:0,extractionNextPage:start+extracted.pages.length},'retry');
   return res.status(200).json({status:'retry',stage:'pdf_extraction_checkpoint',extractedPages:start+extracted.pages.length-1,totalPages:d.pageCount});
  }
  const batches=Array.from({length:Math.ceil(d.pageCount/20)},(_,i)=>prefix+'extracted/'+d.id+'/batch-'+String(i*20).padStart(8,'0')+'.json');
  for(const path of batches)if(!await load(path))throw Error('EXTRACTION_BATCH_MISSING');
  await put(extractionPath,JSON.stringify({pageCount:d.pageCount,batches}),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  await put(prefix+'docs/'+d.id+'.json',JSON.stringify({...d,status:'extraction_complete',extractedPages:d.pageCount,excludedPages:0,extractionNextPage:null}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'pdf_extraction_completed',{...previous,nextDocument:index,nextPage:0,extractionNextPage:null},'retry');
  return res.status(200).json({status:'retry',stage:'pdf_extraction_completed',totalPages:d.pageCount});
 }

 if(!e||(Array.isArray(e.pages)?e.pages.length!==d.pageCount:e.pageCount!==d.pageCount||!Array.isArray(e.batches))){
  await advanceJob(job,'extraction_incomplete',{...previous,nextDocument:index,documentId:d.id},'blocked','PAGE_EXTRACTION_INCOMPLETE');
  return res.status(200).json({status:'blocked',reason:'PAGE_EXTRACTION_INCOMPLETE'});
 }
 if(!Array.isArray(e.pages))assertBatchManifest({batches:e.batches,pageCount:d.pageCount});
 if(previous.nextDocument===index&&previous.nextPage!==undefined&&!Number.isSafeInteger(previous.nextPage))throw Error('INVALID_PAGE_CHECKPOINT');
 const pageOffset=previous.nextDocument===index?(previous.nextPage??0):0;
 if(pageOffset<0||pageOffset>=d.pageCount||pageOffset%20!==0)throw Error('INVALID_CHECKPOINT_OFFSET');
 const batchIndex=Math.floor(pageOffset/20);
 const batchPath=Array.isArray(e.pages)?null:e.batches[batchIndex];
 if(!Array.isArray(e.pages)&&typeof batchPath!=='string')throw Error('MISSING_EXTRACTION_BATCH');
 if(batchPath&&(!batchPath.startsWith(prefix+'extracted/'+d.id+'/')||!batchPath.endsWith('.json')))throw Error('INVALID_EXTRACTION_PATH');
 const batch=Array.isArray(e.pages)?null:await load(batchPath);
 const selectedPages=Array.isArray(e.pages)?e.pages.slice(pageOffset,pageOffset+20):batch?.pages;
 let batchIntegrity;try{batchIntegrity=assertPageBatch({pages:selectedPages,pageOffset,pageCount:d.pageCount})}catch{
  await advanceJob(job,'page_sequence_invalid',{...previous,nextDocument:index,documentId:d.id},'blocked','INVALID_PAGE_SEQUENCE');
  return res.status(200).json({status:'blocked',reason:'INVALID_PAGE_SEQUENCE'});
 }
 if(selectedPages.length===0)throw Error('EMPTY_PAGE_BATCH');
 const digestAudit=verifyPageDigests(selectedPages,{requireDigests:true});
 if(!digestAudit.complete){await advanceJob(job,'source_digest_mismatch',{...previous,nextDocument:index,nextPage:pageOffset,failures:digestAudit.failures.slice(0,20)},'blocked','SOURCE_DIGEST_MISMATCH');return res.status(200).json({status:'blocked',reason:'SOURCE_DIGEST_MISMATCH'})}
 const segmented=segmentRecord({scope:'customer',documentId:d.id,pages:selectedPages});
 if(!auditSegments(selectedPages,segmented.segments).complete)throw Error('SEGMENT_AUDIT');
 const units=segmented.segments.map(u=>({...u,filename:d.name||''}));
 const results=units.map(analyzeUnit),audit=independentlyVerify(units,results);
 if(!audit.complete){
  await advanceJob(job,'ocr_required',{...previous,nextDocument:index,documentId:d.id,missing:audit.missing.slice(0,100)},'blocked','OCR_REQUIRED');
  return res.status(200).json({status:'blocked',reason:'OCR_REQUIRED'});
 }
 const output='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/'+d.id+'-'+String(pageOffset).padStart(8,'0')+'.json';
 const visualPlan=planVisualEvidence({documentId:d.id,pages:selectedPages,images:[]});
 const payload={documentId:d.id,sourceVersion:job.documentVersion,unitCount:units.length,pageCount:selectedPages.length,pageStart:pageOffset+1,verifiedText:true,visualVerified:false,visualPlan,visualInventoryComplete:false,documentBoundaryCandidates:candidateDocuments(selectedPages.map(p=>({...p,documentId:d.id,filename:d.name}))),results};
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
 const checkpoint={nextDocument:finished?index+1:index,nextPage:finished?0:pageOffset+selectedPages.length,documentCount:docs.length,lastDocumentId:d.id,lastOutput:output,verifiedTextDocuments:finished?index+1:index,errorAttempts:0};
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
