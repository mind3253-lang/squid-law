import { randomUUID } from 'node:crypto';
import { initializeDevQueue, claimDevTask, updateDevTask, pool } from '../lib/skynet-dev-queue.mjs';

const owner = 'skynet-dev-' + randomUUID();
const model = process.env.SKYNET_DEV_MODEL || 'gpt-4.1';
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
    signal:AbortSignal.timeout(110000)
  });
  if (!response.ok) throw new Error('GPT API request failed: HTTP '+response.status);
  const body = await response.json();
  const text = (body.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('');
  if (!text) throw new Error('GPT API returned no text');
  return JSON.parse(text);
}

async function run() {
  await initializeDevQueue();
  const task = await claimDevTask(owner);
  if (!task) { console.log('SKYNET_DEV_QUEUE_EMPTY'); return; }
  try {
    const proposal = await plan(task);
    await updateDevTask(task.id,owner,'awaiting_approval',{
      checkpoint:{plan:proposal,planned_at:new Date().toISOString()},
      result:{status:'plan_ready',note:'No code or deployment was executed'}
    });
    console.log('SKYNET_DEV_PLAN_READY',task.id);
  } catch (err) {
    await updateDevTask(task.id,owner,'failed',{error:String(err.message).slice(0,500)});
    console.error('SKYNET_DEV_TASK_FAILED',task.id,String(err.message));
    process.exitCode=1;
  }
}
try { await run(); } finally { await pool.end(); }
