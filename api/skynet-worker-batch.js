import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {runWorkerBatch} from '../lib/skynet-worker-auto-loop.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Vary','Authorization');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='POST')return res.status(405).json({error:'POST_REQUIRED'});
 if(Number(req.headers?.['content-length'])>3000)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});
 try{
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!/^[\w-]{8,80}$/.test(b?.jobId||'')||!/^[\w-]{1,80}$/.test(b?.owner||''))throw Error('INVALID_REQUEST');
  return res.status(200).json(await runWorkerBatch({jobId:b.jobId,owner:b.owner,maxSteps:b.maxSteps??3}));
 }catch(e){return res.status(409).json({error:String(e.message).slice(0,100)})}
}
