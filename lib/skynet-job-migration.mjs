import pg from 'pg';
import {SKYNET_JOB_SCHEMA} from './skynet-job-sql.mjs';
const LOCK_SCHEMA=`CREATE TABLE IF NOT EXISTS skynet_write_locks(job_id text PRIMARY KEY, owner text NOT NULL, token_hash text NOT NULL, expires_at timestamptz NOT NULL)`;
export async function migrateSkynetJobs(connectionString=process.env.POSTGRES_URL){if(!connectionString)throw Error('POSTGRES_REQUIRED');const client=new pg.Client({connectionString,connectionTimeoutMillis:5000});await client.connect();try{await client.query('BEGIN');await client.query(SKYNET_JOB_SCHEMA);await client.query(LOCK_SCHEMA);await client.query('COMMIT');return {ok:true,tables:['skynet_jobs','skynet_write_locks']}}catch(e){await client.query('ROLLBACK');throw e}finally{await client.end()}}
