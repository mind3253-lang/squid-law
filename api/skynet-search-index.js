import {classifyRecord} from './skynet-case-classifier.js';
import {retrievalTerms,selectDiverseEvidence} from '../lib/skynet-evidence-rank.mjs';
import {createHash} from 'node:crypto';
import {put,get,list} from '@vercel/blob';
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
export function entriesOf(data){if(Array.isArray(data?.messages))return data.messages.filter(x=>typeof x.content==='string').flatMap((x,i)=>chunkText(x.content).map((content,j)=>({content,at:x.at||data.createdAt||data.savedAt||null,category:data.category||'',title:data.title||data.name||'',role:x.role||null,part:i+':'+j,case:classifyRecord(content,{title:data.title||data.name||'',category:data.category||''})})));if(typeof data?.text==='string')return chunkText(data.text).map((content,i)=>({content,at:data.at||data.createdAt||null,category:data.category||'',title:data.name||'불변 기억',part:String(i),case:classifyRecord(content,{title:data.name||'',category:data.category||''})}));if(Array.isArray(data?.records))return data.records.filter(x=>typeof x?.text==='string'&&x.text.trim()).flatMap((x,i)=>chunkText(x.text).map((content,j)=>({content,at:x.at||data.savedAt||null,category:x.category||'',title:'기억 DB',part:i+':'+j,case:classifyRecord(content,{category:x.category||''})})));return []}
export async function indexSource(path,data){const entries=entriesOf(data);const sourceId=digest(path);const docs=entries.map(e=>({...e,source:path,id:digest(path+'|'+e.part+'|'+e.content)}));const terms=new Map();for(let i=0;i<docs.length;i++)for(const term of tokens(docs[i].content+' '+docs[i].title+' '+docs[i].category)){const b=bucket(term);if(!terms.has(b))terms.set(b,new Set());terms.get(b).add(i)}const index={version:3,source:path,sourceId,entries:docs,terms:Object.fromEntries([...terms].map(([b,v])=>[b,[...v]])),createdAt:new Date().toISOString()};await put('skynet/search-index/'+sourceId+'.json',JSON.stringify(index),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});cacheIndex('skynet/search-index/'+sourceId+'.json',index);listedIndexes=null;return {entries:docs.length,buckets:terms.size}}
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
 return selectDiverseEvidence([...found.values()],question,{limit:maxResults,maxPerSource:2});
}
