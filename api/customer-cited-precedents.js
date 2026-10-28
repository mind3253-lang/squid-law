import {createHash} from 'node:crypto';
import {casePrefix,readJson} from './customer-case.js';
import {put} from '../lib/customer-object-storage.mjs';
import {collectCitedPrecedents} from '../lib/customer-cited-precedents.mjs';

const digest=docs=>createHash('sha256').update(JSON.stringify([...docs].map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');

export async function loadSubmittedCaseCitations({user,caseId,job,report,documents}){
 if(!user||!caseId||!job?.jobId||!report?.sourceVersion||!Array.isArray(documents))
  return {status:'unavailable',citations:[],reason:'INVALID_CONTEXT'};
 const snapshot=report.deltaReanalysis?.documentSnapshot;
 let docs;
 if(Array.isArray(snapshot)&&snapshot.length){
  const current=new Map(documents.map(d=>[d.id,d]));
  docs=snapshot.map(d=>current.get(d.id)).filter(Boolean);
  if(docs.length!==snapshot.length||snapshot.some(d=>!current.has(d.id)||current.get(d.id).sha256!==d.sha256||current.get(d.id).pageCount!==d.pageCount))
   return {status:'unavailable',citations:[],reason:'DOCUMENT_SNAPSHOT_MISMATCH'};
 }else{
  docs=documents;
  if(digest(docs)!==report.sourceVersion)
   return {status:'unavailable',citations:[],reason:'DOCUMENT_SNAPSHOT_MISMATCH'};
 }
 const root='squidlaw/analysis-jobs/'+casePrefix(user,caseId).split('/')[2]+'/'+caseId+'/'+job.jobId+'/';
 const cachePath=root+'submitted-cited-precedents-v1.json';
 const fingerprint=digest(docs);
 try{
  const cached=await readJson(cachePath);
  if(cached?.sourceVersion===report.sourceVersion&&cached?.documentFingerprint===fingerprint&&
   cached.status==='complete'&&Array.isArray(cached.citations))
   return {status:'complete',citations:cached.citations};
  const prefix=casePrefix(user,caseId);
  const citations=await collectCitedPrecedents({documents:docs,
   loadBatch:(doc,start)=>readJson(prefix+'verified/'+doc.id+'/batch-'+String(start).padStart(8,'0')+'.json')});
  const payload={schema:1,status:'complete',sourceVersion:report.sourceVersion,documentFingerprint:fingerprint,citations};
  try{await put(cachePath,JSON.stringify(payload),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'})}
  catch{/* An overlapping read can create the same immutable cache; do not overwrite it. */}
  return {status:'complete',citations};
 }catch(e){
  console.warn('CUSTOMER_CITED_PRECEDENT_INVENTORY',String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,90));
  return {status:'unavailable',citations:[],reason:'VERIFIED_SOURCE_UNAVAILABLE'};
 }
}
