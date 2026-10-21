import { initializeDevQueue, listDevTasks, getDevTask, pool } from '../lib/skynet-dev-queue.mjs';
try {
  await initializeDevQueue();
  const id = process.argv[2];
  console.log(JSON.stringify(id ? await getDevTask(id) : await listDevTasks(),null,2));
} finally { await pool.end(); }
