import {randomUUID} from 'node:crypto';
import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {validateJobInput} from '../lib/skynet-job-validation.mjs';
import {loadJob,saveJob,listJobs} from '../lib/skynet-job-store.mjs';
import {transitionJob} from '../lib/skynet-job-state.mjs';
import {appendJobEvent} from '../lib/skynet-job-events.mjs';
import {jobReport} from '../lib/skynet-job-report.mjs';
import {latestEvents} from '../lib/skynet-job-history.mjs';
import {scheduleNext} from '../lib/skynet-job-scheduler.mjs';
import {validatePlan} from '../lib/skynet-job-plan.mjs';
import {leaseJob} from '../lib/skynet-job-lease.mjs';
import {resumePoint} from '../lib/skynet-worker-resume.mjs';
import {claimJob} from '../lib/skynet-worker-claim.mjs';
import {recoverJob} from '../lib/skynet-worker-recovery.mjs';
import {checkpointTask} from '../lib/skynet-worker-core.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Authorization');
 if(Number(req.headers['content-length'])>30000)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({error:'STORAGE_REQUIRED'});
 try{
  const id=String(req.query?.id||'');
  if(req.method==='GET'){
   if(!id&&req.query?.view==='tools')return res.status(200).json({tools:availableTools()});
   if(!id)return res.status(200).json(await listJobs());
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return res.status(400).json({error:'INVALID_JOB_ID'});
   const job=await loadJob(id);return job?res.status(200).json(req.query?.view==='report'?{report:{...jobReport(job),schedule:scheduleNext(job.tasks||[])}}:req.query?.view==='events'?{events:latestEvents(job)}:req.query?.view==='resume'?{resume:resumePoint(job)}:{job}):res.status(404).json({error:'NOT_FOUND'});
  }
  if(req.method==='POST'){
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   const input=validateJobInput(body);
   const tasks=body?.tasks===undefined?[]:validatePlan(body.tasks);
   const job=appendJobEvent({id:randomUUID(),...input,tasks,status:'queued',createdAt:new Date().toISOString(),owner:null,checkpoint:null},'created');
   await saveJob(job,{overwrite:false});return res.status(201).json({ok:true,job,pendingTasks:job.tasks.length});
  }
  if(req.method==='PATCH'){
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return res.status(400).json({error:'INVALID_JOB_ID'});
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'INVALID_BODY'});
   const current=await loadJob(id);if(!current)return res.status(404).json({error:'NOT_FOUND'});
   if(body.status==='running'&&(!/^[a-zA-Z0-9_-]{1,80}$/.test(body.owner||'')))return res.status(400).json({error:'OWNER_REQUIRED'});
   if(body.checkpoint&&JSON.stringify(body.checkpoint).length>10000)return res.status(413).json({error:'CHECKPOINT_TOO_LARGE'});
   if(typeof body.reason==='string'&&body.reason.length>1000)return res.status(400).json({error:'REASON_TOO_LONG'});
   if(typeof body.status!=='string'&&!body.taskId)return res.status(400).json({error:'STATUS_REQUIRED'});
   if(body.taskId&&body.taskPatch){if(!body.taskPatch||Array.isArray(body.taskPatch))return res.status(400).json({error:'INVALID_TASK_PATCH'});if(current.status!=='running'||current.owner!==body.owner||Date.parse(current.leaseUntil||'')<=Date.now())return res.status(409).json({error:'OWNER_MISMATCH'});if(body.taskPatch.status&&!['todo','in_progress','blocked','implemented','verified','failed'].includes(body.taskPatch.status))return res.status(400).json({error:'INVALID_TASK_STATUS'});const job=checkpointTask(current,body.taskId,body.taskPatch);await saveJob(job);return res.status(200).json({ok:true,job});}
   const next=body.status==='queued'&&current.status==='running'&&body.recover===true?recoverJob(current):body.status==='running'?claimJob(current,body.owner):transitionJob(current,body?.status,{checkpoint:body?.checkpoint,reason:body?.reason,owner:body?.owner});
   const job=appendJobEvent(next.status==='running'?leaseJob(next,body.owner):next,'status-changed',{from:current.status,to:next.status});
   await saveJob(job);return res.status(200).json({ok:true,job,updatedAt:job.updatedAt});
  }
  res.setHeader('Allow','GET, POST, PATCH');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 }catch(e){return res.status(e instanceof SyntaxError?400:422).json({error:String(e.message||'INVALID_REQUEST').slice(0,100)})}
}
