import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {readJob,writeJob,requireAtomicJobs} from '../lib/skynet-job-store-router.mjs';
import {assertWorkerLease} from '../lib/skynet-worker-lease-check.mjs';
import {executeReadTool} from '../lib/skynet-tool-executor.mjs';
import {generateMultiCodeProposal} from '../lib/skynet-ai-multi-code-proposal.mjs';
import {selectCodeTargets} from '../lib/skynet-ai-target-selector.mjs';
import {stageProposalBatch,batchProgress} from '../lib/skynet-code-proposal-batch.mjs';
import {validateProposalPaths} from '../lib/skynet-code-proposal-paths.mjs';
import {appendJobEvent} from '../lib/skynet-job-events.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});
 if(req.method!=='POST')return res.status(405).json({error:'POST_REQUIRED'});
 if(Number(req.headers?.['content-length'])>12000)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});
 try{
  requireAtomicJobs();const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!/^[\w-]{8,80}$/.test(b?.jobId||'')||!/^[\w-]{1,80}$/.test(b?.owner||'')||!/^[\w-]{1,80}$/.test(b?.taskId||''))throw Error('INVALID_REQUEST');
  const job=await readJob(b.jobId);if(!job)return res.status(404).json({error:'JOB_NOT_FOUND'});
  assertWorkerLease(job,b.owner,15000);
  if(!job.scopes?.includes('repository:read')||!job.scopes?.includes('repository:write'))throw Error('REPOSITORY_SCOPE_REQUIRED');
  const repository=job.writeTargets?.repository,branch=job.writeTargets?.branch;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!branch)throw Error('INVALID_REPOSITORY');
  const selectedTask=job.tasks?.find(t=>t.id===b.taskId);const goal=(String(job.instructions||job.goal||'')+(selectedTask?.repairContext?'\nDeployment repair context: '+selectedTask.repairContext:'')).slice(0,8000);
  const paths=validateProposalPaths(b.autoTargets===true?await selectCodeTargets({goal,repository,branch}):b.paths);if(paths.length>3)throw Error('BATCH_GENERATION_LIMIT');
  const [owner,repo]=repository.split('/');const files=[];
  for(const path of paths){
   const file=await executeReadTool({name:'github.read',args:{owner,repo,path,ref:branch},scopes:job.scopes});
   if(file.type!=='file'||file.encoding!=='base64'||!/^[a-f0-9]{40}$/.test(file.sha||''))throw Error('SOURCE_FILE_REQUIRED');
   const source=Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8');
   files.push({path,sha:file.sha,source});
  }
  const proposals=await generateMultiCodeProposal({goal,repository,branch,files});
  const latest=await readJob(b.jobId);assertWorkerLease(latest,b.owner,15000);
  if(latest.revision!==job.revision)throw Error('REVISION_CONFLICT');
  const staged=appendJobEvent(stageProposalBatch(latest,{taskId:b.taskId,proposals}),'code-batch-proposed',{taskId:b.taskId,paths});
  await writeJob(staged,{expectedRevision:latest.revision});
  return res.status(200).json({ok:true,batch:batchProgress(staged),approvalRequired:true,approvalEndpoint:'/admin/skynet-write-approve',lockEndpoint:'/admin/skynet-write-lock',writeEndpoint:'/admin/skynet-write-run'});
 }catch(e){return res.status(422).json({error:String(e.message||'').slice(0,100)})}
}
