import {classifyRecord} from './skynet-case-classifier.js';
import {searchIndex} from './skynet-search-index.js';
import {retrievalTerms,selectDiverseEvidence,sourceKind} from '../lib/skynet-evidence-rank.mjs';
import {list,get} from '@vercel/blob';
const READ_CACHE_MS=120000;
const READ_CACHE_MAX=200;
const readCache=new Map();
let fileListCache=null;
let fileListCachedAt=0;
async function read(path,limit=3000000){
 const cached=readCache.get(path);
 if(cached&&Date.now()-cached.at<READ_CACHE_MS)return cached.data;
 const item=await get(path,{access:'private'});if(!item||item.statusCode!==200)return null;
 const chunks=[];let size=0;
 for await(const part of item.stream){const b=Buffer.from(part);size+=b.length;if(size>limit)return null;chunks.push(b)}
 const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(size<100000){
  if(readCache.has(path))readCache.delete(path);
  readCache.set(path,{data:parsed,at:Date.now()});
  while(readCache.size>READ_CACHE_MAX)readCache.delete(readCache.keys().next().value);
 }
 return parsed;
}
const rootSources=['skynet/episodes/','skynet/imports/','skynet/memory/','skynet/documents/','skynet/document-segments/','skynet/records/','skynet/db/'];
async function inventory(){
 if(fileListCache&&Date.now()-fileListCachedAt<15000)return fileListCache;
 const groups=await Promise.all(rootSources.map(async prefix=>{
  const files=[];let cursor;
  do{
   const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
   files.push(...page.blobs.filter(b=>b.pathname.endsWith('.json')&&!b.pathname.endsWith('/index.json')));
   cursor=page.hasMore?page.cursor:undefined;
  }while(cursor&&files.length<10000);
  return {prefix,files:files.sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||''))),truncated:!!cursor};
 }));
 fileListCache=groups;fileListCachedAt=Date.now();
 return groups;
}
function sampleByPrefix(groups,maxFiles){
 const out=[];const quota=Math.max(12,Math.floor(maxFiles/Math.max(1,groups.length)));
 for(const group of groups){
  const files=group.files;
  if(files.length<=quota){out.push(...files);continue}
  const recentCount=Math.floor(quota/3);
  const picks=[...files.slice(0,recentCount)];
  for(let i=0;i<quota-recentCount;i++){
   const at=Math.floor((i+0.5)*files.length/(quota-recentCount));
   picks.push(files[Math.min(files.length-1,at)]);
  }
  out.push(...picks);
 }
 return out;
}
function* entriesOfDocument(data){
 if(Array.isArray(data.messages)){
  for(const [i,m] of data.messages.entries()){
   if(typeof m.content==='string')yield {text:m.content,part:String(i),role:m.role,at:m.at||data.savedAt||null};
  }
 }else if(Array.isArray(data.segments)){for(const [i,segment] of data.segments.entries())if(typeof segment?.text==='string')yield {text:'[PDF '+String(segment.page||'?')+'쪽 / 부분 '+String(segment.part||'?')+']\n'+segment.text,part:String(segment.page||i)+':'+String(segment.part||'?'),at:data.createdAt||null};}else if(typeof data.text==='string')yield {text:data.text,part:'0',at:data.at||null};
 else if(Array.isArray(data.records)){
  for(const [i,r] of data.records.entries())if(typeof r.text==='string')yield {text:r.text,part:String(i),at:r.at||null};
 }
}
function evaluateFile(data,path,terms){
 const out=[];
 if(!data)return out;
 let checks=0;
 for(const entry of entriesOfDocument(data)){
  if(++checks>10000)break;
  const full=entry.text;
  // Search the entire recovered message; never limit analysis to its first 3000 chars.
  const chunks=Math.max(1,Math.ceil(full.length/1800));
  for(let i=0;i<chunks;i++){
   const content=full.slice(i*1800,(i+1)*1800);
   const lower=content.normalize('NFKC').toLowerCase();
   const hits=terms.reduce((n,t)=>n+(lower.includes(t)?1:0),0);
   if(!hits)continue;
   out.push({content,source:path,score:hits,role:entry.role,at:entry.at,part:entry.part+':'+i,title:data.title||data.name||'',case:classifyRecord(content,{title:data.title||data.name||'',category:data.category||''})});
  }
 }
 return out.sort((a,b)=>b.score-a.score).slice(0,8);
}
export async function retrieveMemory(question,{maxFiles=160,maxResults=12,indexedResults=null}={}){
 const words=retrievalTerms(question,30);
 if(!words.length)return [];
 let indexed=[],indexError=null;
 try{indexed=Array.isArray(indexedResults)?indexedResults:await searchIndex(question,{maxResults:Math.max(60,maxResults*6),maxIndexFiles:250})}
 catch(e){indexError=String(e?.message||e);console.error('SKYNET_INDEX_SEARCH_FAILED',indexError.slice(0,200))}
 // Do not stop after 12 hits from one recent handover. Prefer original records.
 const independent=new Set(indexed.filter(x=>sourceKind(x.source)!=='memory').map(x=>x.source)).size;
 if(indexed.length>=maxResults&&independent>=4)return selectDiverseEvidence(indexed,question,{limit:maxResults,maxPerSource:2});
 let groups;
 try{groups=await inventory()}catch(e){
  if(indexed.length)return selectDiverseEvidence(indexed,question,{limit:maxResults});
  throw Error('SKYNET_MEMORY_INVENTORY_FAILED: '+String(e?.message||e).slice(0,150));
 }
 const selected=sampleByPrefix(groups,maxFiles);
 const found=[];
 for(let i=0;i<selected.length;i+=16){
  const batch=await Promise.all(selected.slice(i,i+16).map(async f=>{
   try{return evaluateFile(await read(f.pathname),f.pathname,words)}catch(e){console.error('SKYNET_MEMORY_RECORD_SKIPPED',f.pathname,String(e?.message||e).slice(0,80));return []}
  }));
  found.push(...batch.flat());
 }
 const merged=selectDiverseEvidence([...indexed,...found],question,{limit:maxResults,maxPerSource:2});
 if(!merged.length&&indexError)throw Error('SKYNET_SEARCH_UNAVAILABLE: '+indexError.slice(0,120));
 return merged;
}
