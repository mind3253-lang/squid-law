import {classifyRecord} from './skynet-case-classifier.js';
import {retrievalTerms,selectDiverseEvidence} from '../lib/skynet-evidence-rank.mjs';
import {categoryDigestEntries,sourceTopicEntries} from '../lib/skynet-topic-categories.mjs';
import {indexSearchExcerpts,querySearchExcerpts} from '../lib/skynet-search-db.mjs';
import {upsertTopics} from '../lib/skynet-topic-db.mjs';
import {createHash} from 'node:crypto';
import {put,get,list} from '../lib/customer-object-storage.mjs';
// Per-function warm caches avoid repeatedly downloading the same private Blob
// indexes for each question of one long test. Bounded size and time-to-live.
const INDEX_CACHE_MS=120000;
const INDEX_CACHE_MAX=1200;
const INDEX_CACHE_MAX_BYTES=48*1024*1024;
const indexCache=new Map();
let indexCacheBytes=0;
let listedIndexes=null;
let listedAt=0;
function cacheIndex(path,data,bytes){
 const size=bytes===undefined?Buffer.byteLength(JSON.stringify(data),'utf8'):bytes;
 if(size>2500000)return;
 const previous=indexCache.get(path);if(previous){indexCacheBytes-=previous.bytes;indexCache.delete(path)}
 indexCache.set(path,{data,at:Date.now(),bytes:size});indexCacheBytes+=size;
 while(indexCache.size>INDEX_CACHE_MAX||indexCacheBytes>INDEX_CACHE_MAX_BYTES){const first=indexCache.keys().next().value;indexCacheBytes-=indexCache.get(first).bytes;indexCache.delete(first)}
}
export const tokens=s=>[...new Set((String(s||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(w=>w.length>1))];
const digest=s=>createHash('sha256').update(s).digest('hex');
const bucket=t=>digest(t).slice(0,3);
const chunkText=(text,size=1800)=>{const out=[];for(let i=0;i<text.length;i+=size)out.push(text.slice(i,i+size));return out};
export function entriesOf(data){if(Array.isArray(data?.messages))return data.messages.filter(x=>typeof x.content==='string').flatMap((x,i)=>chunkText(x.content).map((content,j)=>({content,at:x.at||data.createdAt||data.savedAt||null,category:data.category||'',title:data.title||data.name||'',role:x.role||null,part:i+':'+j,case:classifyRecord(content,{title:data.title||data.name||'',category:data.category||''})})));if(Array.isArray(data?.segments))return data.segments.filter(x=>typeof x?.text==='string'&&x.text.trim()).flatMap((segment,i)=>chunkText('[PDF '+String(segment.page||'?')+'쪽 / 부분 '+String(segment.part||'?')+']\n'+segment.text).map((content,j)=>({content,at:data.createdAt||null,category:data.category||'',title:data.name||('PDF 원본 '+String(data.hash||'').slice(0,12)),part:String(segment.page||i)+':'+String(segment.part||j),page:segment.page||null,case:classifyRecord(content,{title:data.name||'',category:data.category||''})})));if(typeof data?.text==='string')return chunkText(data.text).map((content,i)=>({content,at:data.at||data.createdAt||null,category:data.category||'',title:data.name||'불변 기억',part:String(i),case:classifyRecord(content,{title:data.name||'',category:data.category||''})}));if(Array.isArray(data?.records))return data.records.filter(x=>typeof x?.text==='string'&&x.text.trim()).flatMap((x,i)=>chunkText(x.text).map((content,j)=>({content,at:x.at||data.savedAt||null,category:x.category||'',title:'기억 DB',part:i+':'+j,case:classifyRecord(content,{category:x.category||''})})));return []}
export async function indexSource(path,data){
 const sourceId=digest(path),createdAt=new Date().toISOString();
 // Persist cheap, independent topic evidence before the expensive case/search
 // index. A slow or failed full-text job must not hide the source from the
 // memory categories.
 const categories=categoryDigestEntries(sourceTopicEntries(data),{source:path,name:data.title||data.name||data.category||''});
 await put('skynet/category-index/'+sourceId+'.json',JSON.stringify(categories),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 // User can query this category immediately without scanning old Blob files.
 // A temporary SQL outage cannot discard the independently stored sidecar.
 try{await upsertTopics([categories])}catch(e){console.error('SKYNET_TOPIC_DB_SYNC_DEFERRED',String(e.message).slice(0,140))}
 const entries=entriesOf(data);
 const docs=entries.map(e=>({...e,source:path,id:digest(path+'|'+e.part+'|'+e.content)}));
 const makeIndex=items=>{
  const terms=new Map();
  for(let i=0;i<items.length;i++)for(const term of tokens(items[i].content+' '+items[i].title+' '+items[i].category)){
   const b=bucket(term);
   if(!terms.has(b))terms.set(b,new Set());
   terms.get(b).add(i);
  }
  return {version:4,source:path,sourceId,entries:items,terms:Object.fromEntries([...terms].map(([b,v])=>[b,[...v]])),createdAt};
 };
 const base='skynet/search-index/'+sourceId+'.json';
 const shardSize=120;
 const shards=Math.max(1,Math.ceil(docs.length/shardSize));
 // Chunk large conversation indexes rather than producing a single unreadable
 // >12MB index that is silently skipped by historical retrieval.
 for(let offset=0;offset<shards;offset+=6){
  const batch=Array.from({length:Math.min(6,shards-offset)},(_,j)=>{
   const n=offset+j;
   const part=docs.slice(n*shardSize,(n+1)*shardSize);
   const index=makeIndex(part);
   const filename=shards===1?base:'skynet/search-index/'+sourceId+'-part-'+String(n).padStart(5,'0')+'.json';
   return {index,filename};
  });
  await Promise.all(batch.map(async item=>{
   await put(item.filename,JSON.stringify(item.index),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
   cacheIndex(item.filename,item.index);
  }));
 }
 if(shards>1){
  // The source ID path is a completed manifest; never mark finished before
  // every fragment has been durably written.
  const manifest={version:4,source:path,sourceId,entries:[],terms:{},shards,indexedEntries:docs.length,createdAt};
  await put(base,JSON.stringify(manifest),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
  cacheIndex(base,manifest);
 }
 // SQL read model is an optimization, never the only copy. Every original
 // excerpt is already persisted in private Blob before it is indexed here.
 try{await indexSearchExcerpts(path,docs)}catch(e){
  console.error('SKYNET_SQL_SEARCH_INDEX_DEFERRED',String(e?.message||e).slice(0,160));
 }
 listedIndexes=null;
 return {entries:docs.length,shards,buckets:0,categorized:categories.classified};
}
export async function listIndex(){if(listedIndexes&&Date.now()-listedAt<15000)return listedIndexes;const files=[];let cursor;do{const page=await list({prefix:'skynet/search-index/',limit:1000,...(cursor?{cursor}:{})});files.push(...page.blobs.filter(b=>b.pathname.endsWith('.json')));cursor=page.hasMore?page.cursor:undefined}while(cursor&&files.length<100000);listedIndexes=files;listedAt=Date.now();return files}
export async function readIndex(path){const cached=indexCache.get(path);if(cached&&Date.now()-cached.at<INDEX_CACHE_MS)return cached.data;const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let n=0;const chunks=[];for await(const x of r.stream){const b=Buffer.from(x);n+=b.length;if(n>12000000)throw Error('Index exceeds size limit');chunks.push(b)}const index=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(n<=2500000)cacheIndex(path,index,n);return index}
export function rankIndex(index,question){
 const raw=tokens(question);
 const words=[...new Set([...retrievalTerms(question,30),...raw])].slice(0,40);
 if(!words.length||!index?.entries||!index?.terms)return [];
 const candidates=new Set();
 for(const w of words)for(const pos of index.terms[bucket(w)]||[])candidates.add(pos);
 const results=[];
 for(const pos of candidates){
  const e=index.entries[pos];if(!e?.content)continue;
  const content=e.content.normalize('NFKC').toLowerCase();
  const title=String(e.title||'').normalize('NFKC').toLowerCase();
  const hits=words.filter(w=>content.includes(w));
  if(!hits.length&&words.every(w=>!title.includes(w)))continue;
  const score=hits.length*2+Math.min(3,words.filter(w=>title.includes(w)).length);
  if(score)results.push({...e,score});
 }
 return results.sort((a,b)=>b.score-a.score).slice(0,60);
}
export async function searchIndex(question,{maxResults=12,maxIndexFiles=250}={}){
 const words=retrievalTerms(question,30);
 if(!words.length)return [];
 let sqlMatches=[];
 try{
  const sql=await querySearchExcerpts(question,{limit:900});
  if(sql?.entries?.length){
   sqlMatches=sql.entries;
   const ranked=selectDiverseEvidence(sqlMatches,question,
    {limit:maxResults,maxPerSource:2});
   // Fast return only when the indexed evidence is sufficiently diverse.
   // Sparse/ambiguous queries still use the legacy exhaustive Blob index
   // scan until the historical corpus has been fully migrated.
   const independent=new Set(ranked.map(x=>x.source)).size;
   if(ranked.length>=maxResults&&independent>=4)return ranked;
  }
 }catch(e){console.error('SKYNET_SQL_SEARCH_FALLBACK',String(e?.message||e).slice(0,150))}
 const files=await listIndex();
 const found=new Map();
 for(let offset=0;offset<files.length;offset+=Math.max(1,maxIndexFiles)){
  const page=files.slice(offset,offset+Math.max(1,maxIndexFiles));
  for(let i=0;i<page.length;i+=32){
   const batch=await Promise.all(page.slice(i,i+32).map(f=>readIndex(f.pathname).catch(()=>null)));
   for(const idx of batch)for(const e of rankIndex(idx,question)){
    const id=digest(e.source+'|'+e.part+'|'+e.content);
    if(!found.has(id)||found.get(id).score<e.score)found.set(id,e);
   }
  }
 }
 return selectDiverseEvidence([...sqlMatches,...found.values()],question,{limit:maxResults,maxPerSource:2});
}

export async function searchIndexMulti(queries,{maxResults=48}={}){
 if(!Array.isArray(queries)||!queries.length)return [];
 const unique=queries.slice(0,24).map(q=>String(q||'').slice(0,6000));
 const found=unique.map(()=>new Map());
 const files=await listIndex();
 for(let offset=0;offset<files.length;offset+=32){
  const batch=await Promise.all(files.slice(offset,offset+32).map(f=>readIndex(f.pathname).catch(()=>null)));
  for(const idx of batch){
   if(!idx?.entries?.length)continue;
   for(let q=0;q<unique.length;q++){
    for(const entry of rankIndex(idx,unique[q])){
     const key=digest(entry.source+'|'+entry.part+'|'+entry.content);
     if(!found[q].has(key)||found[q].get(key).score<entry.score)found[q].set(key,entry);
    }
   }
  }
 }
 return found.map((bucket,i)=>selectDiverseEvidence([...bucket.values()],unique[i],{limit:maxResults,maxPerSource:4}));
}
