import {claimJob,advanceJob} from './customer-analysis-jobs-db.js';
import {get} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeUnit,independentlyVerify} from '../lib/legal-evidence-review.mjs';
import {put} from '@vercel/blob';
import {candidateDocuments} from './customer-document-boundaries.js';
import {planVisualEvidence} from '../lib/visual-evidence.mjs';
import {assertPageBatch,assertBatchManifest} from '../lib/batch-integrity.mjs';
import {expectedTextReviewOutputs,auditTextReviewOutputs} from '../lib/text-review-manifest.mjs';
import {verifyPageDigests} from '../lib/page-digests.mjs';
import {ANALYSIS_STAGES} from '../lib/analysis-pipeline-state.mjs';
import {aggregateTextReview} from '../lib/text-review-aggregation.mjs';
const eq=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
async function load(path){const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let size=0,parts=[];for await(const chunk of r.stream){size+=chunk.length;if(size>32*1024*1024)throw Error('BLOB_TOO_LARGE');parts.push(Buffer.from(chunk))}return JSON.parse(Buffer.concat(parts).toString())}
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
 const docs=meta.filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id)),version=createHash('sha256').update(JSON.stringify(docs.map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 if(version!==job.documentVersion){await advanceJob(job,'source_changed',{expected:job.documentVersion,actual:version},'blocked','SOURCE_VERSION_CHANGED');return res.status(200).json({status:'blocked',reason:'SOURCE_VERSION_CHANGED'})}

 const previous=job.checkpoint||{},index=Number.isSafeInteger(previous.nextDocument)?previous.nextDocument:0;
 if(index>=docs.length){
  await advanceJob(job,'awaiting_visual_verification',{...previous,documentCount:docs.length},'blocked','VISUAL_EVIDENCE_NOT_VERIFIED');
  return res.status(200).json({status:'blocked',reason:'VISUAL_EVIDENCE_NOT_VERIFIED'});
 }
 const d=docs[index],e=await load(prefix+'extracted/'+d.id+'.json');
 if(!e||(Array.isArray(e.pages)?e.pages.length!==d.pageCount:e.pageCount!==d.pageCount||!Array.isArray(e.batches))){
  await advanceJob(job,'extraction_incomplete',{...previous,nextDocument:index,documentId:d.id},'blocked','PAGE_EXTRACTION_INCOMPLETE');
  return res.status(200).json({status:'blocked',reason:'PAGE_EXTRACTION_INCOMPLETE'});
 }
 if(!Array.isArray(e.pages))assertBatchManifest({batches:e.batches,pageCount:d.pageCount});
 const pageOffset=Number.isSafeInteger(previous.nextPage)&&previous.nextDocument===index?previous.nextPage:0;
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
 const digestAudit=verifyPageDigests(selectedPages);
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
  // Load the exact persisted batch payloads; a pathname-only audit cannot verify contents.
  const persisted=[];
  for(let offset=0;offset<expected.length;offset+=8){
   const group=await Promise.all(expected.slice(offset,offset+8).map(async path=>({path,payload:await load(path)})));
   persisted.push(...group);
  }
  let aggregate;
  try{aggregate=aggregateTextReview({caseId:job.caseId,sourceVersion:job.documentVersion,root,documents:docs,outputs:persisted})}
  catch{await advanceJob(job,'text_review_content_invalid',{...checkpoint},'blocked','TEXT_REVIEW_CONTENT_INVALID');return res.status(200).json({status:'blocked',reason:'TEXT_REVIEW_CONTENT_INVALID'})}
  const aggregatePath=root+'text-review-aggregate.json';
  await put(aggregatePath,JSON.stringify(aggregate),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  const manifestPath=root+'text-review-manifest.json';
  await put(manifestPath,JSON.stringify({caseId:job.caseId,sourceVersion:job.documentVersion,documents:docs.map(x=>({id:x.id,pageCount:x.pageCount})),outputs:expected,verifiedVisual:false,verifiedLegal:false,analysisComplete:false,pendingStages:ANALYSIS_STAGES.slice(2)}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
  await advanceJob(job,'text_review_completed_visual_pending',{...checkpoint,textReviewManifest:manifestPath,textReviewAggregate:aggregatePath},'blocked','VISUAL_EVIDENCE_NOT_VERIFIED');
  return res.status(200).json({status:'blocked',reason:'VISUAL_EVIDENCE_NOT_VERIFIED',verifiedTextDocuments:docs.length});
 }
 await advanceJob(job,'text_review_checkpoint',checkpoint,'retry');
 return res.status(200).json({status:'retry',processedDocuments:checkpoint.verifiedTextDocuments,processedPages:checkpoint.nextPage,totalDocuments:docs.length});

 }catch(e){if(job){try{await advanceJob(job,'error',{...(job.checkpoint||{}),errorAttempts:Number(job.checkpoint?.errorAttempts||0)+1,message:String(e.message||e).slice(0,250)},(Number(job.attempts||0)+1)>=job.maxAttempts?'failed':'retry','WORKER_ERROR')}catch{}}return res.status(503).json({error:'WORKER_ERROR'})}
}
