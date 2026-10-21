import { initializeDevQueue, retryDevTask, pool } from '../lib/skynet-dev-queue.mjs';
const id = process.argv[2];
if (!id) { console.error('Usage: node scripts/skynet-dev-retry.mjs TASK_UUID'); process.exit(2); }
try {
  await initializeDevQueue();
  if (!await retryDevTask(id)) { console.error('Task not failed or not found'); process.exitCode=1; }
  else console.log('SKYNET_DEV_REQUEUED',id);
} finally { await pool.end(); }
