import {claimJob,advanceJob} from './customer-analysis-jobs-db.js';
import {get} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
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
 const meta=await Promise.all((await import('@vercel/blob')).list({prefix:prefix+'docs/',limit:1000}).then(r=>r.blobs.filter(b=>b.pathname.endsWith('.json')).map(b=>load(b.pathname))));
 const docs=meta.filter(Boolean),version=createHash('sha256').update(JSON.stringify(docs.map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 if(version!==job.documentVersion){await advanceJob(job,'source_changed',{expected:job.documentVersion,actual:version},'blocked','SOURCE_VERSION_CHANGED');return res.status(200).json({status:'blocked',reason:'SOURCE_VERSION_CHANGED'})}
 const coverage=[];for(const d of docs){const e=await load(prefix+'extracted/'+d.id+'.json');const pages=e?.pages||[],nums=new Set(pages.map(p=>p.page));coverage.push({documentId:d.id,total:d.pageCount,extracted:pages.length,unique:nums.size,unreadable:pages.filter(p=>!String(p.text||'').trim()).map(p=>p.page)})}
 const missing=coverage.some(c=>c.extracted!==c.total||c.unique!==c.total||c.unreadable.length);
 if(missing){await advanceJob(job,'extraction_incomplete',{coverage},'blocked','OCR_REQUIRED');return res.status(200).json({status:'blocked',reason:'OCR_REQUIRED'})}
 await advanceJob(job,'full_review_not_implemented',{coverage},'blocked','ANALYSIS_PIPELINE_REQUIRED');
 return res.status(200).json({status:'blocked',reason:'ANALYSIS_PIPELINE_REQUIRED'});
 }catch(e){if(job){try{await advanceJob(job,'error',{message:String(e.message||e).slice(0,250)},job.attempts>=job.maxAttempts?'failed':'retry','WORKER_ERROR')}catch{}}return res.status(503).json({error:'WORKER_ERROR'})}
}
