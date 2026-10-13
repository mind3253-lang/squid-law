import {list,put} from '@vercel/blob';
import {categoryDigestEntries} from '../lib/skynet-topic-categories.mjs';
import {listIndex} from './skynet-search-index.js';
import {createHash} from 'node:crypto';
import {indexSource,readIndex,entriesOf} from './skynet-search-index.js';
import {readJSON} from './skynet-records.js';
const send=(res,n,data)=>res.status(n).setHeader('Cache-Control','no-store').json(data);
function authorized(req){try{return !!process.env.ADMIN_PASSWORD&&String(req.headers.authorization||'').startsWith('Basic ')&&Buffer.from(String(req.headers.authorization).slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}}
export default async function handler(req,res){if(req.method!=='POST')return send(res,405,{error:'POST only'});if(!authorized(req))return send(res,401,{error:'관리자 인증 필요'});let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{return send(res,400,{error:'잘못된 JSON 형식'})}const prefixes=['skynet/imports/','skynet/memory/','skynet/documents/','skynet/document-segments/','skynet/records/','skynet/db/'];const requested=Number(body.limit)||15;const limit=Math.min(30,Math.max(1,requested));const prefix=prefixes.includes(body.prefix)?body.prefix:prefixes[0];const cursor=typeof body.cursor==='string'&&body.cursor.length<3000?body.cursor:undefined;try{if(body.action==='status'){const counts={};for(const p of prefixes){let total=0,cur;do{const pg=await list({prefix:p,limit:1000,...(cur?{cursor:cur}:{})});total+=pg.blobs.filter(b=>b.pathname.endsWith('.json')&&!b.pathname.endsWith('/index.json')).length;cur=pg.hasMore?pg.cursor:undefined}while(cur&&total<100000);counts[p]={total,truncated:!!cur}}const indexes=await listIndex();return send(res,200,{ok:true,counts,indexFiles:indexes.length,approximate:true})}const page=await list({prefix,limit,...(cursor?{cursor}:{})});let indexed=0,skipped=0,failed=0;const errors=[];const files=page.blobs.filter(b=>b.pathname.endsWith('.json')&&!b.pathname.endsWith('/index.json')).slice(0,limit);for(const f of files){const id=createHash('sha256').update(f.pathname).digest('hex');try{const existing=await readIndex('skynet/search-index/'+id+'.json').catch(()=>null);
 const categoryPath='skynet/category-index/'+id+'.json';
 const categorized=await readJSON(categoryPath,160000).catch(()=>null);
 const indexedSearch=existing?.version===4&&(existing.shards>0||(Array.isArray(existing.entries)&&existing.entries.length>0));
 if(indexedSearch&&categorized?.version===2){skipped++;continue}
 let data=await readJSON(f.pathname,12000000).catch(()=>null);
 if(data&&f.pathname.startsWith('skynet/document-segments/')&&!data.name){
  const hash=f.pathname.split('/')[2];
  if(/^[a-f0-9]{64}$/.test(hash)){
   const manifest=await readJSON('skynet/documents/'+hash+'.json',180000).catch(()=>null);
   if(manifest?.name)data={...data,name:manifest.name,category:manifest.category||''};
  }
 }
 if(!data&&indexedSearch){
  // A very large imported conversation may have been indexed as many smaller
  // search shards. Reconstruct just its classification metadata from shards.
  const fromIndexes=[];
  let pageCursor;
  do{
   const page=await list({prefix:'skynet/search-index/'+id+'-part-',limit:1000,...(pageCursor?{cursor:pageCursor}:{})});
   const batch=await Promise.all(page.blobs.filter(x=>x.pathname.endsWith('.json')).map(async x=>readIndex(x.pathname).catch(()=>null)));
   fromIndexes.push(...batch.flatMap(x=>Array.isArray(x?.entries)?x.entries:[]));
   pageCursor=page.hasMore?page.cursor:undefined;
  }while(pageCursor&&fromIndexes.length<100000);
  if(fromIndexes.length){
   const summary=categoryDigestEntries(fromIndexes,{source:f.pathname,name:existing.source||f.pathname});
   await put(categoryPath,JSON.stringify(summary),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
   indexed++;continue;
  }
 }
 if(!data)throw Error('ORIGINAL_RECORD_TOO_LARGE_OR_MISSING');
 const entries=entriesOf(data);
 if(!entries.length){skipped++;continue}
 if(indexedSearch){
  const summary=categoryDigestEntries(entries,{source:f.pathname,name:data.title||data.name||data.category||''});
  await put(categoryPath,JSON.stringify(summary),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 }else await indexSource(f.pathname,data);
 indexed++}catch(e){failed++;errors.push({path:f.pathname,error:String(e.message).slice(0,120)});console.error('Backfill failed',f.pathname,String(e.message).slice(0,120))}}return send(res,200,{ok:true,prefix,indexed,skipped,failed,processed:files.length,errors,hasMore:page.hasMore,nextCursor:page.hasMore?page.cursor:null})}catch(e){return send(res,502,{error:'인덱스 작업 실패',detail:String(e.message).slice(0,150)})}}
