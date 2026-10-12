import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {readJob,requireAtomicJobs} from '../lib/skynet-job-store-router.mjs';
import {approvedCodeProposal} from '../lib/skynet-code-proposal-state.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return res.status(405).json({error:'GET_REQUIRED'});
 try{requireAtomicJobs();const id=String(req.query?.jobId||'');if(!/^[\w-]{8,80}$/.test(id))throw Error('INVALID_JOB_ID');const job=await readJob(id);if(!job)return res.status(404).json({error:'JOB_NOT_FOUND'});const proposal=job.codeProposal||null;let ready=false;try{approvedCodeProposal(job);ready=true}catch{}return res.status(200).json({jobId:id,proposal,readyToWrite:ready,requiresLock:ready,writeEndpoint:'/admin/skynet-write-run'});}catch(e){return res.status(422).json({error:String(e.message).slice(0,100)})}
}
