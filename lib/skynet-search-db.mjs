/**
 * Indexed SKYNET read model. Original files stay in private Blob storage;
 * SQL holds private, replaceable excerpt and term-index data.
 */
import pg from 'pg';
import {createHash} from 'node:crypto';
import {retrievalTerms} from './skynet-evidence-rank.mjs';
const DB_URL=()=>process.env.SKYNET_DATABASE_URL||
 process.env.SQUID_CUSTOMER_DATABASE_POSTGRES_URL||
 process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL||
 process.env.SQUID_CUSTOMER_DATABASE_URL||'';
let pool=null,initializing=null;
function connect(){
 if(!DB_URL())return null;
 if(!pool){
  pool=new pg.Pool({connectionString:DB_URL(),max:3,connectionTimeoutMillis:4000,
   idleTimeoutMillis:15000,allowExitOnIdle:true,
   ssl:process.env.SQUID_CUSTOMER_DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
  pool.on('error',e=>console.error('SKYNET_SEARCH_DB_IDLE_ERROR',String(e?.code||'ERROR')));
 }
 return pool;
}
async function db(){
 if(!connect())return null;
 if(!initializing)initializing=(async()=>{
  const p=connect();
  await p.query('CREATE SCHEMA IF NOT EXISTS skynet_internal');
  await p.query('CREATE TABLE IF NOT EXISTS skynet_internal.search_excerpts ('+
   'id TEXT PRIMARY KEY,source TEXT NOT NULL,part TEXT NOT NULL,page INTEGER,'+
   'content TEXT NOT NULL,title TEXT NOT NULL DEFAULT \'\','+
   'category TEXT NOT NULL DEFAULT \'\',at TEXT,role TEXT,terms TEXT[] NOT NULL,'+
   'updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  await p.query('CREATE INDEX IF NOT EXISTS skynet_search_terms_gin '+
   'ON skynet_internal.search_excerpts USING gin(terms)');
  await p.query('CREATE INDEX IF NOT EXISTS skynet_search_source_idx '+
   'ON skynet_internal.search_excerpts(source)');
  await p.query('CREATE TABLE IF NOT EXISTS skynet_internal.search_indexed_sources ('+
   'source TEXT PRIMARY KEY,entry_count INTEGER NOT NULL,'+
   'indexed_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  return p;
 })().catch(e=>{initializing=null;throw e});
 return initializing;
}
const splitTerms=s=>[...new Set((String(s||'').normalize('NFKC').toLowerCase()
 .match(/[\p{L}\p{N}]{2,}/gu)||[]).slice(0,900))];
export function searchTerms(text){
 const raw=splitTerms(text),normalized=retrievalTerms(text,900);
 return [...new Set([...raw,...normalized])].slice(0,1200);
}
export const searchDbEnabled=()=>Boolean(DB_URL());
export async function indexSearchExcerpts(source,entries,{complete=true}={}){
 if(!searchDbEnabled())return {available:false,indexed:0};
 if(typeof source!=='string'||!source.startsWith('skynet/')||
  !Array.isArray(entries)||entries.length>50000)throw Error('INVALID_SEARCH_INDEX_BATCH');
 const p=await db();
 const client=await p.connect();
 try{
  await client.query('BEGIN');
  if(complete)await client.query(
   'DELETE FROM skynet_internal.search_excerpts WHERE source=$1',[source]);
  for(let start=0;start<entries.length;start+=80){
   const records=entries.slice(start,start+80).map((entry,index)=>{
    const content=String(entry.content||'').slice(0,2200),part=String(entry.part||start+index);
    return {id:createHash('sha256').update(source+'|'+part+'|'+content).digest('hex'),
     source,part,page:Number.isInteger(entry.page)?entry.page:null,
     content,title:String(entry.title||'').slice(0,250),
     category:String(entry.category||'').slice(0,100),
     at:entry.at===undefined?null:String(entry.at).slice(0,70),
     role:entry.role===undefined?null:String(entry.role).slice(0,30),
     terms:searchTerms(content+' '+(entry.title||'')+' '+(entry.category||''))};
   }).filter(x=>x.content.trim());
   if(!records.length)continue;
   await client.query('INSERT INTO skynet_internal.search_excerpts '+
    '(id,source,part,page,content,title,category,at,role,terms,updated_at) '+
    'SELECT x.id,x.source,x.part,x.page,x.content,x.title,x.category,x.at,x.role,x.terms,now() '+
    'FROM jsonb_to_recordset($1::jsonb) '+
    'AS x(id text,source text,part text,page integer,content text,title text,'+
    'category text,at text,role text,terms text[]) '+
    'ON CONFLICT(id) DO UPDATE SET '+
    'content=EXCLUDED.content,title=EXCLUDED.title,category=EXCLUDED.category,'+
    'at=EXCLUDED.at,role=EXCLUDED.role,terms=EXCLUDED.terms,'+
    'updated_at=now()',[JSON.stringify(records)]);
  }
  if(complete)await client.query('INSERT INTO skynet_internal.search_indexed_sources '+
   '(source,entry_count,indexed_at) VALUES($1,$2,now()) '+
   'ON CONFLICT(source) DO UPDATE SET '+
   'entry_count=EXCLUDED.entry_count,indexed_at=now()',[source,entries.length]);
  await client.query('COMMIT');
  return {available:true,indexed:entries.length};
 }catch(e){
  try{await client.query('ROLLBACK')}catch{}
  throw e;
 }finally{client.release()}
}
export async function querySearchExcerpts(question,{limit=500}={}){
 if(!searchDbEnabled())return null;
 const terms=searchTerms(question).slice(0,36);
 if(!terms.length)return {available:true,entries:[],sources:0};
 const p=await db();
 const [found,stats]=await Promise.all([
  p.query('SELECT source,part,page,content,title,category,at,role '+
   'FROM skynet_internal.search_excerpts WHERE terms && $1::text[] '+
   'ORDER BY updated_at DESC LIMIT $2',[terms,Math.min(1200,Math.max(40,limit))]),
  p.query('SELECT COUNT(*)::integer AS sources FROM skynet_internal.search_indexed_sources')
 ]);
 return {available:true,sources:stats.rows[0]?.sources||0,
  entries:found.rows.map(x=>({...x,score:0}))};
}
