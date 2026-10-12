import {isSkynetAdmin} from '../lib/skynet-job-api-auth.mjs';
import {loadJob,saveJob} from '../lib/skynet-job-store.mjs';
import {executeReadTool} from '../lib/skynet-tool-executor.mjs';
import {registerOperation,finishOperation,failOperation} from '../lib/skynet-worker-operations.mjs';
import {validateToolRequest} from '../lib/skynet-worker-request.mjs';
import {appendJobEvent} from '../lib/skynet-job-events.mjs';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Authorization');if(Number(req.headers?.['content-length'])>30000)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});if(!isSkynetAdmin(req))return res.status(401).json({error:'ADMIN_REQUIRED'});if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({error:'STORAGE_REQUIRED'});if(req.method!=='POST')return res.status(405).json({error:'POST_REQUIRED'});
try{const b=validateToolRequest(typeof req.body==='string'?JSON.parse(req.body):req.body);const job=await loadJob(b.jobId);if(!job)return res.status(404).json({error:'JOB_NOT_FOUND'});if(job.status!=='running'||job.owner!==b.owner||!(Date.parse(job.leaseUntil)>Date.now()))return res.status(409).json({error:'LEASE_REQUIRED'});
const scopes=Array.isArray(job.scopes)?job.scopes:[];if(!scopes.includes(b.tool.startsWith('github.')?'repository:read':'deployment:read'))return res.status(403).json({error:'SCOPE_REQUIRED'});
const registered=registerOperation(job,b.step,b.tool,b.args);if(registered.duplicate)return res.status(409).json({error:'OPERATION_ALREADY_REGISTERED',key:registered.key});
const pending=appendJobEvent(registered.job,'tool-started',{key:registered.key,tool:b.tool});await saveJob(pending);
try{const result=await executeReadTool({name:b.tool,args:b.args,scopes});const latest=await loadJob(b.jobId);if(latest?.owner!==b.owner||latest?.status!=='running')throw Error('LEASE_LOST');const done=appendJobEvent(finishOperation(latest,registered.key,{ok:true,summary:JSON.stringify(result).slice(0,1000)}),'tool-completed',{key:registered.key});await saveJob(done);return res.status(200).json({ok:true,key:registered.key,result})}
catch(e){const latestFailed=await loadJob(b.jobId);const failed=appendJobEvent(failOperation(latestFailed||pending,registered.key,e.message),'tool-failed',{key:registered.key});await saveJob(failed);return res.status(502).json({error:'TOOL_FAILED',code:/^(UPSTREAM_[0-9]+|CREDENTIAL_NOT_CONFIGURED|TOOL_RESPONSE_TOO_LARGE|TOOL_EXECUTION_NOT_CONNECTED)$/.test(String(e.message))?String(e.message):'TOOL_EXECUTION_ERROR'})}
}catch(e){return res.status(400).json({error:String(e.message).slice(0,100)})}}
