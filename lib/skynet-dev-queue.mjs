import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;
const STAGES = new Set(['queued','analyzing','editing','testing','awaiting_approval','deploying','verifying','completed','failed']);
export const pool = new Pool({ connectionString: process.env.SKYNET_DEV_DATABASE_URL || process.env.SQUID_CUSTOMER_DATABASE_URL || process.env.DATABASE_URL });

export async function initializeDevQueue() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS skynet_dev_tasks (
      id uuid PRIMARY KEY,
      topic text NOT NULL,
      instruction text NOT NULL,
      stage text NOT NULL DEFAULT 'queued',
      checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
      result jsonb,
      error text,
      attempts integer NOT NULL DEFAULT 0,
      lease_owner text,
      lease_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS skynet_dev_tasks_claim_idx ON skynet_dev_tasks(stage, lease_until, created_at);
  `);
}

export async function enqueueDevTask({ topic, instruction }) {
  if (!topic?.trim() || !instruction?.trim()) throw new Error('topic and instruction required');
  const id = randomUUID();
  await pool.query('INSERT INTO skynet_dev_tasks(id,topic,instruction) VALUES($1,$2,$3)', [id,topic.trim(),instruction.trim()]);
  return id;
}

export async function claimDevTask(owner, leaseSeconds = 180) {
  const { rows } = await pool.query(`
    WITH candidate AS (
      SELECT id FROM skynet_dev_tasks
      WHERE stage IN ('queued','analyzing')
        AND (lease_until IS NULL OR lease_until < now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE skynet_dev_tasks t SET stage='analyzing',lease_owner=$1,
      lease_until=now()+($2 * interval '1 second'),attempts=attempts+1,updated_at=now()
    FROM candidate WHERE t.id=candidate.id RETURNING t.*
  `, [owner,leaseSeconds]);
  return rows[0] ?? null;
}

export async function updateDevTask(id, owner, stage, { checkpoint, result, error } = {}) {
  if (!STAGES.has(stage)) throw new Error('Invalid stage');
  const terminal = stage === 'completed' || stage === 'failed' || stage === 'awaiting_approval';
  const { rows } = await pool.query(`
    UPDATE skynet_dev_tasks SET stage=$3,checkpoint=COALESCE($4,checkpoint),
      result=COALESCE($5,result),error=$6,
      lease_owner=CASE WHEN $7 THEN NULL ELSE lease_owner END,
      lease_until=CASE WHEN $7 THEN NULL ELSE now()+interval '180 seconds' END,
      updated_at=now()
    WHERE id=$1 AND lease_owner=$2 RETURNING *
  `, [id,owner,stage,checkpoint ?? null,result ?? null,error ?? null,terminal]);
  if (!rows.length) throw new Error('Lease lost');
  return rows[0];
}

export async function getDevTask(id) {
  const { rows } = await pool.query('SELECT * FROM skynet_dev_tasks WHERE id=$1',[id]);
  return rows[0] ?? null;
}

export async function listDevTasks(limit = 30) {
  const { rows } = await pool.query(
    'SELECT id,topic,stage,checkpoint,result,error,attempts,created_at,updated_at FROM skynet_dev_tasks ORDER BY created_at DESC LIMIT $1',
    [Math.max(1,Math.min(100,Number(limit)||30))]
  );
  return rows;
}

export async function retryDevTask(id) {
  const { rows } = await pool.query(
    "UPDATE skynet_dev_tasks SET stage='queued',lease_owner=NULL,lease_until=NULL,error=NULL,updated_at=now() WHERE id=$1 AND stage='failed' RETURNING id",
    [id]
  );
  return rows.length === 1;
}
