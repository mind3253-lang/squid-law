import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {readJob,writeJob,requireAtomicJobs} from '../lib/skynet-job-store-router.mjs';
import {executeReadTool} from '../lib/skynet-tool-executor.mjs';
import {generateCodeProposal} from '../lib/skynet-ai-code-proposal.mjs';
import {appendJobEvent} from '../lib/skynet-job-events.mjs';
import {assertWorkerLease} from '../lib/skynet-worker-lease-check.mjs';
import {stageCodeProposal} from '../lib/skynet-code-proposal-state.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
  if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
  if(req.method!=='POST')return res.status(405).json({error:'POST_REQUIRED'});
  if(Number(req.headers?.['content-length'])>12000)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});
  try{
    requireAtomicJobs();const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!b||!/^[\w-]{8,80}$/.test(b.jobId||'')||!/^[\w-]{1,80}$/.test(b.owner||'')||typeof b.path!=='string'||b.path.length>500)throw Error('INVALID_REQUEST');
    const job=await readJob(b.jobId);if(!job)return res.status(404).json({error:'JOB_NOT_FOUND'});
    assertWorkerLease(job,b.owner,15000);
    const repository=job.writeTargets?.repository,branch=job.writeTargets?.branch;
    if(!repository||!branch||!job.scopes?.includes('repository:read'))throw Error('REPOSITORY_SCOPE_REQUIRED');
    if(!/^[\w-]{1,80}$/.test(b.taskId||''))throw Error('INVALID_TASK_ID');
    if(!job.scopes?.includes('repository:write'))throw Error('WRITE_SCOPE_REQUIRED');
    if(job.codeProposal&&job.codeProposal.status!=='committed')throw Error('PROPOSAL_ALREADY_EXISTS');
    const [owner,repo]=repository.split('/');
    const file=await executeReadTool({name:'github.read',args:{owner,repo,path:b.path,ref:branch},scopes:job.scopes});
    if(file.type!=='file'||file.encoding!=='base64'||!/^[a-f0-9]{40}$/.test(file.sha||''))throw Error('SOURCE_FILE_REQUIRED');
    const source=Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8');
    const proposal=await generateCodeProposal({goal:job.instructions||job.goal,repository,branch,path:b.path,sha:file.sha,source});
    const updated=appendJobEvent(stageCodeProposal(job,{taskId:b.taskId,proposal}),'code-proposed',{taskId:b.taskId,path:b.path,sha:file.sha});
    await writeJob(updated,{expectedRevision:job.revision});
    return res.status(200).json({ok:true,proposal:updated.codeProposal,approvalRequired:true,approvalEndpoint:'/admin/skynet-write-approve',lockEndpoint:'/admin/skynet-write-lock',writeEndpoint:'/admin/skynet-write-run'});
  }catch(e){const msg=String(e.message||'');return res.status(422).json({error:/^(INVALID_|SOURCE_|REPOSITORY_|PROPOSAL_|CODE_|OPENAI_|LEASE_|JOB_)/.test(msg)?msg:'CODE_PROPOSAL_FAILED'})}
}
