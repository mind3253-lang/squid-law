/**
 * Durable, indexed read model for SKYNET topic metadata.
 * Original conversations and snippets remain in the private Blob store.
 * This table stores only source locators, topic counts and page/unit counts.
 * Every upsert is idempotent; SQL owns the cross-browser migration lease.
 */
import pg from 'pg';
import {TOPIC_IDS,TOPIC_SCHEMA_VERSION} from './skynet-topic-categories.mjs';
const PREFIXES=Object.freeze([
 'skynet/document-segments/','skynet/documents/','skynet/imports/',
 'skynet/memory/','skynet/records/','skynet/db/'
]);
const URL=()=>process.env.SKYNET_DATABASE_URL||
 process.env.SQUID_CUSTOMER_DATABASE_POSTGRES_URL||
 process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL||
 process.env.SQUID_CUSTOMER_DATABASE_URL||'';
let pool,initializing;
export const topicDbEnabled=()=>Boolean(URL());
function connection(){
 if(!URL())throw Error('SKYNET_TOPIC_DB_UNAVAILABLE');
 pool??=new pg.Pool({connectionString:URL(),max:4,connectionTimeoutMillis:4500,
  idleTimeoutMillis:12000,ssl:process.env.SQUID_CUSTOMER_DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
 return pool;
}
async function db(){
 if(!initializing){
  initializing=(async()=>{
   const p=connection();
   await p.query(`CREATE SCHEMA IF NOT EXISTS skynet_internal`);
   await p.query(`CREATE TABLE IF NOT EXISTS skynet_internal.topic_sources (
    source TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    version SMALLINT NOT NULL DEFAULT 3,
    units INTEGER NOT NULL DEFAULT 0,
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`);
   await p.query(`CREATE TABLE IF NOT EXISTS skynet_internal.topic_backfill (
    prefix TEXT PRIMARY KEY,
    cursor TEXT,
    item_offset INTEGER NOT NULL DEFAULT 0,
    processed BIGINT NOT NULL DEFAULT 0,
    failed BIGINT NOT NULL DEFAULT 0,
    complete BOOLEAN NOT NULL DEFAULT false,
    owner TEXT,
    lease_until TIMESTAMPTZ,
    error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`);
   await p.query('CREATE INDEX IF NOT EXISTS skynet_topic_sources_updated ON skynet_internal.topic_sources(updated_at DESC)');
   await p.query(`INSERT INTO skynet_internal.topic_backfill(prefix) SELECT unnest($1::text[])
     ON CONFLICT(prefix) DO NOTHING`,[PREFIXES]);
   return p;
  })().catch(e=>{initializing=null;throw e});
 }
 return initializing;
}
export async function upsertTopics(records){
 if(!records?.length||!topicDbEnabled())return 0;
 const valid=records.filter(r=>typeof r?.source==='string'&&r.source.startsWith('skynet/')&&
  r.counts&&typeof r.counts==='object').map(r=>({
  source:r.source,name:String(r.name||'').slice(0,180),
  version:Number(r.version)||TOPIC_SCHEMA_VERSION,
  units:Math.max(0,Math.min(10000000,Number(r.units)||0)),
  counts:Object.fromEntries(TOPIC_IDS.map(id=>[id,Math.max(0,Number(r.counts[id])||0)]))
 }));
 if(!valid.length)return 0;
 const p=await db();
 await p.query(`INSERT INTO skynet_internal.topic_sources(source,name,version,units,counts,updated_at)
  SELECT x.source,x.name,x.version,x.units,x.counts,now()
  FROM jsonb_to_recordset($1::jsonb)
  AS x(source text,name text,version smallint,units integer,counts jsonb)
  ON CONFLICT(source) DO UPDATE SET
  name=EXCLUDED.name,version=EXCLUDED.version,units=EXCLUDED.units,
  counts=EXCLUDED.counts,updated_at=now()`,[JSON.stringify(valid)]);
 return valid.length;
}
export async function topicDashboard(){
 const p=await db();
 const sql=TOPIC_IDS.map(id=>`COALESCE(SUM((counts->>'${id}')::bigint),0)::text AS "${id}"`).join(',');
 const [stats,backfill]=await Promise.all([
  p.query(`SELECT COUNT(*)::text AS sources,COALESCE(SUM(units),0)::text AS units,${sql}
    FROM skynet_internal.topic_sources`),
  p.query(`SELECT prefix,processed::text,failed::text,complete,error,updated_at,
    (lease_until>now()) AS running FROM skynet_internal.topic_backfill
    WHERE prefix=ANY($1::text[]) ORDER BY prefix`,[PREFIXES])
 ]);
 const row=stats.rows[0]||{},status=backfill.rows.map(x=>({
  prefix:x.prefix,processed:Number(x.processed)||0,failed:Number(x.failed)||0,
  complete:x.complete,running:x.running,error:x.error||null,updatedAt:x.updated_at
 }));
 return {available:true,sourceCount:Number(row.sources)||0,units:Number(row.units)||0,
  counts:Object.fromEntries(TOPIC_IDS.map(id=>[id,Number(row[id])||0])),
  backfill:status,complete:status.length===PREFIXES.length&&status.every(x=>x.complete),
  schemaVersion:TOPIC_SCHEMA_VERSION};
}
export async function topicSources(topic,{limit=25,offset=0}={}){
 if(!TOPIC_IDS.includes(topic))throw Error('UNKNOWN_TOPIC');
 const p=await db();
 // Counts come from the source's actual text; do not guess from filename.
 const r=await p.query(`SELECT source,name,(counts->>$1)::integer AS count
  FROM skynet_internal.topic_sources WHERE (counts->>$1)::integer>0
  ORDER BY updated_at DESC,source LIMIT $2 OFFSET $3`,[
   topic,Math.min(40,Math.max(1,Number(limit)||25)),Math.max(0,Number(offset)||0)
  ]);
 return r.rows;
}
export async function claimTopicBackfill(prefix,owner){
 if(!PREFIXES.includes(prefix)||!/^[\w-]{10,80}$/.test(owner))throw Error('BAD_BACKFILL_CLAIM');
 const p=await db();
 const r=await p.query(`UPDATE skynet_internal.topic_backfill
  SET owner=$2,lease_until=now()+interval '45 seconds',updated_at=now()
  WHERE prefix=$1 AND complete=false AND (lease_until IS NULL OR lease_until<now())
  RETURNING cursor,item_offset,processed::text,failed::text`,[prefix,owner]);
 if(!r.rowCount){
  const state=await p.query('SELECT complete,lease_until>now() AS running FROM skynet_internal.topic_backfill WHERE prefix=$1',[prefix]);
  return {claimed:false,complete:Boolean(state.rows[0]?.complete),busy:Boolean(state.rows[0]?.running)};
 }
 return {claimed:true,cursor:r.rows[0].cursor||undefined,offset:Number(r.rows[0].item_offset)||0};
}
export async function finishTopicBackfill(prefix,owner,{cursor=null,offset=0,processed=0,failed=0,complete=false,error=null}={}){
 const p=await db();
 const r=await p.query(`UPDATE skynet_internal.topic_backfill SET
  cursor=$3,item_offset=$4,processed=processed+$5,failed=failed+$6,
  complete=$7,error=COALESCE($8,error),owner=NULL,lease_until=NULL,updated_at=now()
  WHERE prefix=$1 AND owner=$2 RETURNING complete`,[
   prefix,owner,cursor,offset,processed,failed,complete,error
  ]);
 if(!r.rowCount)throw Error('BACKFILL_LEASE_LOST');
 return r.rows[0].complete;
}
export async function releaseTopicBackfill(prefix,owner,error){
 const p=await db();
 await p.query(`UPDATE skynet_internal.topic_backfill
  SET owner=NULL,lease_until=NULL,error=$3,updated_at=now()
  WHERE prefix=$1 AND owner=$2`,[prefix,owner,String(error||'').slice(0,250)]);
}
export async function resetTopicBackfill(){
 const p=await db();
 const r=await p.query(`SELECT COUNT(*)::integer AS running
  FROM skynet_internal.topic_backfill WHERE lease_until>now()`);
 if(r.rows[0]?.running)throw Error('BACKFILL_BUSY');
 await p.query(`UPDATE skynet_internal.topic_backfill SET
  cursor=NULL,item_offset=0,processed=0,failed=0,complete=false,
  error=NULL,owner=NULL,lease_until=NULL,updated_at=now()`);
}
export const TOPIC_ROOTS=PREFIXES;
