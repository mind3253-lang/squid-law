import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {readJob,writeJob,requireAtomicJobs} from '../lib/skynet-job-store-router.mjs';
import {assertWorkerLease} from '../lib/skynet-worker-lease-check.mjs';
import {reconcileCommittedProposal} from '../lib/skynet-code-proposal-reconcile.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='POST')return res.status(405).json({error:'POST_REQUIRED'});
 try{requireAtomicJobs();const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!/^[\w-]{8,80}$/.test(b?.jobId||'')||!/^[\w-]{1,80}$/.test(b?.owner||''))throw Error('INVALID_REQUEST');const job=await readJob(b.jobId);if(!job)return res.status(404).json({error:'JOB_NOT_FOUND'});assertWorkerLease(job,b.owner);const next=reconcileCommittedProposal(job);if(next!==job)await writeJob(next,{expectedRevision:job.revision});return res.status(200).json({ok:true,taskId:next.codeProposal.taskId,commitSha:next.codeProposal.commitSha,status:next.codeProposal.status});}catch(e){return res.status(409).json({error:String(e.message).slice(0,100)})}
}
