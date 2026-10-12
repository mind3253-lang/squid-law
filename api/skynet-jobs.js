import {randomUUID} from 'node:crypto';
import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {validateJobInput} from '../lib/skynet-job-validation.mjs';
import {loadJob,saveJob,listJobs} from '../lib/skynet-job-store.mjs';
import {transitionJob} from '../lib/skynet-job-state.mjs';
import {appendJobEvent} from '../lib/skynet-job-events.mjs';
import {jobReport} from '../lib/skynet-job-report.mjs';
import {latestEvents} from '../lib/skynet-job-history.mjs';
import {scheduleNext} from '../lib/skynet-job-scheduler.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Authorization');
 if(Number(req.headers['content-length'])>30000)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({error:'STORAGE_REQUIRED'});
 try{
  const id=String(req.query?.id||'');
  if(req.method==='GET'){
   if(!id)return res.status(200).json(await listJobs());
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return res.status(400).json({error:'INVALID_JOB_ID'});
   const job=await loadJob(id);return job?res.status(200).json(req.query?.view==='report'?{report:{...jobReport(job),schedule:scheduleNext(job.tasks||[])}}:req.query?.view==='events'?{events:latestEvents(job)}:{job}):res.status(404).json({error:'NOT_FOUND'});
  }
  if(req.method==='POST'){
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   const input=validateJobInput(body);
   const job=appendJobEvent({id:randomUUID(),...input,status:'queued',createdAt:new Date().toISOString(),owner:null,checkpoint:null},'created');
   await saveJob(job,{overwrite:false});return res.status(201).json({ok:true,job});
  }
  if(req.method==='PATCH'){
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return res.status(400).json({error:'INVALID_JOB_ID'});
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'INVALID_BODY'});
   const current=await loadJob(id);if(!current)return res.status(404).json({error:'NOT_FOUND'});
   if(typeof body.status!=='string')return res.status(400).json({error:'STATUS_REQUIRED'});
   const next=transitionJob(current,body?.status,{checkpoint:body?.checkpoint,reason:body?.reason,owner:body?.owner});
   const job=appendJobEvent(next,'status-changed',{from:current.status,to:next.status});
   await saveJob(job);return res.status(200).json({ok:true,job,updatedAt:job.updatedAt});
  }
  res.setHeader('Allow','GET, POST, PATCH');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 }catch(e){return res.status(e instanceof SyntaxError?400:422).json({error:String(e.message||'INVALID_REQUEST').slice(0,100)})}
}
