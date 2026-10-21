import { randomUUID } from 'node:crypto';
import { initializeDevQueue, claimDevTask, updateDevTask, pool } from '../lib/skynet-dev-queue.mjs';

const owner = 'skynet-dev-' + randomUUID();
const model = process.env.SKYNET_DEV_MODEL || 'gpt-4.1';
const apiTimeoutMs = 110000;
import { readRepositoryFile, proposeFileChanges, openProposalPullRequest } from '../lib/skynet-dev-github.mjs';
const instructions = `You are SKYNET's persistent development planning worker. Return JSON with keys summary, proposed_files (array of {path,change}), checks (array of strings), risks (array of strings). Never include secrets, shell commands to execute, or claims of applied changes. Keep existing SKYNET topic-based memory and chat continuity intact.`;

async function plan(task) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ Authorization:'Bearer '+key,'Content-Type':'application/json' },
    body:JSON.stringify({
      model,
      instructions,
      input:JSON.stringify({topic:task.topic,instruction:task.instruction,checkpoint:task.checkpoint}),
      text:{format:{type:'json_object'}}
    }),
    signal:AbortSignal.timeout(apiTimeoutMs)
  });
  if (!response.ok) throw new Error('GPT API request failed: HTTP '+response.status);
  const body = await response.json();
  if (body.status !== 'completed') throw new Error('GPT API incomplete response: '+String(body.status));
  const text = (body.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('');
  if (!text) throw new Error('GPT API returned no text');
  return JSON.parse(text);
}

async function draftChanges(task, proposal) {
  const proposed = Array.isArray(proposal.proposed_files) ? proposal.proposed_files : [];
  if (proposed.length > 10) throw new Error('Too many proposed files for single review');
  if (!proposed.length) return null;
  const changes = [];
  for (const file of proposed) {
    if (typeof file.path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(file.path) || file.path.includes('..')) throw new Error('Unsafe proposed path');
    if (file.path.startsWith('.github/') || file.path.startsWith('deploy/') || file.path.includes('.env') || file.path === 'package.json' || file.path.endsWith('package-lock.json')) throw new Error('Protected path requires manual change');
    let current = '';
    try { current = (await readRepositoryFile(file.path)).content; }
    catch (e) { if (!String(e.message).includes(' 404')) throw e; }
    const key = process.env.OPENAI_API_KEY;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        instructions:'Produce the full replacement UTF-8 source for the requested file. Output only source code, no markdown. Do not include secrets. Preserve unrelated existing behavior.',
        input:JSON.stringify({instruction:task.instruction,path:file.path,requested_change:file.change,current_source:current.slice(0,70000)})
      }),
      signal:AbortSignal.timeout(apiTimeoutMs)
    });
    if (!response.ok) throw new Error('GPT code generation HTTP '+response.status);
    const data = await response.json();
    if (data.status !== 'completed') throw new Error('Incomplete code generation');
    const generated = (data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
    if (!generated.trim() || generated.length>150000 || generated.startsWith('```')) throw new Error('Invalid generated source');
    changes.push({path:file.path,content:generated});
  }
  if (!changes.length) return null;
  const result = await proposeFileChanges({taskId:task.id,files:changes});
  const pr = await openProposalPullRequest({taskId:task.id,branch:result.branch,summary:proposal.summary||task.instruction});
  return {...result,pr};
}

async function run() {
  await initializeDevQueue();
  const task = await claimDevTask(owner);
  if (!task) { console.log('SKYNET_DEV_QUEUE_EMPTY'); return; }
  try {
    const proposal = await plan(task);
    const changes = process.env.SKYNET_DEV_CREATE_DRAFT_PR === 'YES' ? await draftChanges(task,proposal) : null;
    await updateDevTask(task.id,owner,'awaiting_approval',{
      checkpoint:{plan:proposal,changes,planned_at:new Date().toISOString()},
      result:{status:changes?'draft_pr_ready':'plan_ready',pr:changes?.pr||null,note:'Production code was not deployed'}
    });
    console.log('SKYNET_DEV_PLAN_READY',task.id);
  } catch (err) {
    await updateDevTask(task.id,owner,'failed',{error:String(err.message).slice(0,500)});
    console.error('SKYNET_DEV_TASK_FAILED',task.id,String(err.message));
    process.exitCode=1;
  }
}
try { await run(); } finally { await pool.end(); }
