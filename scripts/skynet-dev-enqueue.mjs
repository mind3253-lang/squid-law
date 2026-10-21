import { initializeDevQueue, enqueueDevTask, pool } from '../lib/skynet-dev-queue.mjs';
const [topic,instruction] = process.argv.slice(2);
try {
  await initializeDevQueue();
  console.log(await enqueueDevTask({topic,instruction}));
} finally {
  await pool.end();
}
