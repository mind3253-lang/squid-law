import {claimJob,advanceJob} from './customer-analysis-jobs-db.js';
import {get} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import {prepareCorpus} from '../lib/corpus-coverage.mjs';
import {analyzeUnit,independentlyVerify} from '../lib/legal-evidence-review.mjs';
import {put} from '@vercel/blob';
import {candidateDocuments} from './customer-document-boundaries.js';
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
 // Do not claim completed until OCR, document boundaries, cross-check and independent verification exist.
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
 if(!e||!Array.isArray(e.pages)||e.pages.length!==d.pageCount){
  await advanceJob(job,'extraction_incomplete',{...previous,nextDocument:index,documentId:d.id},'blocked','PAGE_EXTRACTION_INCOMPLETE');
  return res.status(200).json({status:'blocked',reason:'PAGE_EXTRACTION_INCOMPLETE'});
 }
 if(new Set(e.pages.map(p=>p.page)).size!==d.pageCount||e.pages.some((p,i)=>p.page!==i+1)){
  await advanceJob(job,'page_sequence_invalid',{...previous,nextDocument:index,documentId:d.id},'blocked','INVALID_PAGE_SEQUENCE');
  return res.status(200).json({status:'blocked',reason:'INVALID_PAGE_SEQUENCE'});
 }
 const pageOffset=Number.isSafeInteger(previous.nextPage)&&previous.nextDocument===index?previous.nextPage:0;
 const selectedPages=e.pages.slice(pageOffset,pageOffset+20);
 if(selectedPages.length===0)throw Error('EMPTY_PAGE_BATCH');
 const selected=prepareCorpus('customer',[{id:d.id,name:d.name,pageCount:selectedPages.length,pages:selectedPages.map((p,i)=>({...p,page:i+1}))}]);
 const units=selected.units.map(u=>({...u,page:selectedPages[u.page-1].page,hash:u.hash}));
 const results=units.map(analyzeUnit),audit=independentlyVerify(units,results);
 if(!audit.complete){
  await advanceJob(job,'ocr_required',{...previous,nextDocument:index,documentId:d.id,missing:audit.missing.slice(0,100)},'blocked','OCR_REQUIRED');
  return res.status(200).json({status:'blocked',reason:'OCR_REQUIRED'});
 }
 const output='squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/'+d.id+'-'+String(pageOffset).padStart(8,'0')+'.json';
 const payload={documentId:d.id,sourceVersion:job.documentVersion,unitCount:units.length,pageCount:selectedPages.length,pageStart:pageOffset+1,verifiedText:true,visualVerified:false,documentBoundaryCandidates:candidateDocuments(selectedPages.map(p=>({...p,documentId:d.id,filename:d.name}))),results};
 const existing=await load(output);
 if(existing&&existing.sourceVersion!==job.documentVersion)throw Error('RESULT_VERSION_MISMATCH');
 if(!existing)await put(output,JSON.stringify(payload),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
 const finished=pageOffset+selectedPages.length>=d.pageCount;
 const checkpoint={nextDocument:finished?index+1:index,nextPage:finished?0:pageOffset+selectedPages.length,documentCount:docs.length,lastDocumentId:d.id,lastOutput:output,verifiedTextDocuments:finished?index+1:index};
 if(finished&&index+1===docs.length){
  await advanceJob(job,'text_review_completed_visual_pending',checkpoint,'blocked','VISUAL_EVIDENCE_NOT_VERIFIED');
  return res.status(200).json({status:'blocked',reason:'VISUAL_EVIDENCE_NOT_VERIFIED',verifiedTextDocuments:docs.length});
 }
 await advanceJob(job,'text_review_checkpoint',checkpoint,'retry');
 return res.status(200).json({status:'retry',processedDocuments:checkpoint.verifiedTextDocuments,processedPages:checkpoint.nextPage,totalDocuments:docs.length});

 }catch(e){if(job){try{await advanceJob(job,'error',{...(job.checkpoint||{}),errorAttempts:Number(job.checkpoint?.errorAttempts||0)+1,message:String(e.message||e).slice(0,250)},(Number(job.checkpoint?.errorAttempts||0)+1)>=job.maxAttempts?'failed':'retry','WORKER_ERROR')}catch{}}return res.status(503).json({error:'WORKER_ERROR'})}
}
