import {get,list} from '@vercel/blob';
import {TOPIC_IDS} from '../lib/skynet-topic-categories.mjs';
const ROOT='skynet/category-index/';
const send=(res,code,data)=>res.status(code).setHeader('Vary','Authorization').setHeader('Cache-Control','private, no-store').json(data);
function authorized(req){
 try{const h=String(req.headers.authorization||'');return !!process.env.ADMIN_PASSWORD&&h.startsWith('Basic ')&&Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}
}
async function readSmall(path){
 const file=await get(path,{access:'private'});if(!file||file.statusCode!==200)throw Error('INDEX_MISSING');
 const chunks=[];let bytes=0;
 for await(const item of file.stream){const b=Buffer.from(item);bytes+=b.length;if(bytes>160000)throw Error('CATEGORY_INDEX_TOO_LARGE');chunks.push(b)}
 const record=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(![1,2,3].includes(record?.version)||typeof record.source!=='string'||!record.counts||!record.examples)throw Error('INVALID_CATEGORY_INDEX');
 return {source:record.source,version:record.version,name:String(record.name||'').slice(0,180),units:record.units||0,
  counts:Object.fromEntries(TOPIC_IDS.map(id=>[id,Math.max(0,Number(record.counts[id])||0)])),
  examples:Object.fromEntries(TOPIC_IDS.map(id=>[id,(record.examples[id]||[]).slice(0,7).map(x=>({
   part:String(x.part||''),page:x.page||null,at:x.at||null,role:x.role||null,text:String(x.text||'').slice(0,410)
  }))]))
 };
}
export default async function handler(req,res){
 if(!authorized(req))return send(res,401,{error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return send(res,405,{error:'GET_ONLY'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'MEMORY_STORAGE_NOT_CONNECTED'});
 const limit=Math.max(1,Math.min(40,Number(req.query?.limit)||30));
 const cursor=typeof req.query?.cursor==='string'&&req.query.cursor.length<=3000?req.query.cursor:undefined;
 try{
  const page=await list({prefix:ROOT,limit,...(cursor?{cursor}:{})});
  const files=page.blobs.filter(x=>x.pathname.endsWith('.json'));
  const records=[],errors=[];
  for(let i=0;i<files.length;i+=10){
   const results=await Promise.allSettled(files.slice(i,i+10).map(x=>readSmall(x.pathname)));
   for(let j=0;j<results.length;j++){
    const result=results[j],path=files[i+j].pathname;
    if(result.status==='fulfilled')records.push(result.value);
    else errors.push({source:path,reason:String(result.reason?.message||'UNKNOWN').slice(0,75)});
   }
  }
  return send(res,200,{ok:errors.length===0,records,errors,
   hasMore:page.hasMore,nextCursor:page.hasMore?page.cursor:null,scanned:files.length,
   note:'카테고리는 중복 가능한 내용별 태그다. 검색 색인이 없는 원본은 집계되지 않는다.'});
 }catch(e){
  console.error('SKYNET_CATEGORY_READ_FAILED',String(e?.message||e).slice(0,160));
  return send(res,502,{error:'CATEGORY_READ_FAILED'});
 }
}
