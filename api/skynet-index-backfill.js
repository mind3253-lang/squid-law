import {list,put} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {categoryDigestEntries} from '../lib/skynet-topic-categories.mjs';
import {indexSource,readIndex,entriesOf,listIndex} from './skynet-search-index.js';
import {readJSON} from './skynet-records.js';

const ROOTS=['skynet/imports/','skynet/memory/','skynet/documents/','skynet/document-segments/','skynet/records/','skynet/db/'];
const send=(res,n,data)=>res.status(n).setHeader('Cache-Control','no-store').json(data);
function authorized(req){
 try{
  const h=String(req.headers.authorization||'');
  return !!process.env.ADMIN_PASSWORD&&h.startsWith('Basic ')&&
   Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
}
async function restoreFromIndexShards(id,path,existing){
 const recovered=[];let cursor,checked=0;
 do{
  const page=await list({prefix:'skynet/search-index/'+id+'-part-',limit:100,...(cursor?{cursor}:{})});
  for(let i=0;i<page.blobs.length;i+=12){
   const chunk=await Promise.all(page.blobs.slice(i,i+12).filter(x=>x.pathname.endsWith('.json'))
    .map(async x=>readIndex(x.pathname).catch(()=>null)));
   recovered.push(...chunk.flatMap(x=>Array.isArray(x?.entries)?x.entries:[]));
  }
  checked+=page.blobs.length;
  cursor=page.hasMore?page.cursor:undefined;
 }while(cursor&&checked<10000);
 if(!recovered.length||cursor)return false;
 const digest=categoryDigestEntries(recovered,{source:path,name:existing?.source||path});
 await put('skynet/category-index/'+id+'.json',JSON.stringify(digest),{
  access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 return true;
}
async function indexOne(file){
 const path=file.pathname,id=createHash('sha256').update(path).digest('hex');
 const search=await readIndex('skynet/search-index/'+id+'.json').catch(()=>null);
 const classified=await readJSON('skynet/category-index/'+id+'.json',160000).catch(()=>null);
 const currentSearch=search?.version===4&&(search.shards>0||(Array.isArray(search.entries)&&search.entries.length>0));
 if(currentSearch&&classified?.version===3)return {status:'skipped'};
 let data=await readJSON(path,24000000).catch(()=>null);
 if(data&&path.startsWith('skynet/document-segments/')&&!data.name){
  const hash=path.split('/')[2];
  if(/^[a-f0-9]{64}$/.test(hash)){
   const manifest=await readJSON('skynet/documents/'+hash+'.json',180000).catch(()=>null);
   if(manifest?.name)data={...data,name:manifest.name,category:manifest.category||''};
  }
 }
 if(!data&&currentSearch){
  if(await restoreFromIndexShards(id,path,search))return {status:'indexed'};
 }
 if(!data)throw Error('원본 JSON 판독 불가 또는 24MB 초과: '+path);
 const entries=entriesOf(data);
 if(!entries.length)return {status:'skipped',unindexed:true};
 if(currentSearch){
  const categories=categoryDigestEntries(entries,{source:path,name:data.title||data.name||data.category||''});
  await put('skynet/category-index/'+id+'.json',JSON.stringify(categories),{
   access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 }else await indexSource(path,data);
 return {status:'indexed'};
}
async function inventoryStatus(prefixes){
 const counts=await Promise.all(prefixes.map(async prefix=>{
  let total=0,cursor;
  do{
   const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
   total+=page.blobs.filter(x=>x.pathname.endsWith('.json')&&!x.pathname.endsWith('/index.json')).length;
   cursor=page.hasMore?page.cursor:undefined;
  }while(cursor&&total<100000);
  return [prefix,{total,truncated:!!cursor}];
 }));
 const indexes=await listIndex();
 return {ok:true,counts:Object.fromEntries(counts),indexFiles:indexes.length,approximate:true};
}
export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'POST only'});
 if(!authorized(req))return send(res,401,{error:'관리자 인증 필요'});
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}
 catch{return send(res,400,{error:'잘못된 JSON 형식'})}
 const limit=Math.min(30,Math.max(1,Number(body.limit)||15));
 const prefix=ROOTS.includes(body.prefix)?body.prefix:ROOTS[0];
 const cursor=typeof body.cursor==='string'&&body.cursor.length<3000?body.cursor:undefined;
 try{
  if(body.action==='status')return send(res,200,await inventoryStatus(ROOTS));
  const page=await list({prefix,limit,...(cursor?{cursor}:{})});
  const files=page.blobs.filter(x=>x.pathname.endsWith('.json')&&!x.pathname.endsWith('/index.json')).slice(0,limit);
  let indexed=0,skipped=0,failed=0,unindexed=0;const errors=[];
  // Max 3 source files in parallel: faster restoration without overwhelming Blob
  // or rebuilding huge full-text indexes concurrently.
  for(let offset=0;offset<files.length;offset+=3){
   const group=files.slice(offset,offset+3);
   const results=await Promise.allSettled(group.map(indexOne));
   results.forEach((item,i)=>{
    if(item.status==='rejected'){
     const error=String(item.reason?.message||item.reason).slice(0,160);
     errors.push({path:group[i].pathname,error});failed++;
     console.error('SKYNET_CATEGORY_BACKFILL_FAILED',group[i].pathname,error);
    }else if(item.value.status==='indexed')indexed++;
    else{skipped++;if(item.value.unindexed)unindexed++}
   });
  }
  return send(res,200,{ok:true,prefix,indexed,skipped,failed,unindexed,
   processed:files.length,errors,hasMore:page.hasMore,nextCursor:page.hasMore?page.cursor:null});
 }catch(e){
  console.error('SKYNET_CATEGORY_BACKFILL_REQUEST_FAILED',String(e?.message||e).slice(0,200));
  return send(res,502,{error:'인덱스 작업 실패',detail:String(e?.message||e).slice(0,150)});
 }
}
