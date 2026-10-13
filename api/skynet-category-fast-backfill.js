import {get,list,put} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {categoryDigestEntries,sourceTopicEntries,TOPIC_SCHEMA_VERSION} from '../lib/skynet-topic-categories.mjs';

const ROOTS=['skynet/imports/','skynet/memory/','skynet/documents/','skynet/document-segments/','skynet/records/','skynet/db/'];
const CATEGORY_BASE='skynet/category-index/';
const TIME_BUDGET_MS=19000;
const send=(res,n,o)=>res.status(n).setHeader('Cache-Control','no-store').setHeader('Vary','Authorization').json(o);
function authorize(req){
 try{const auth=String(req.headers.authorization||'');return !!process.env.ADMIN_PASSWORD&&auth.startsWith('Basic ')&&Buffer.from(auth.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}
}
async function readJSON(path,maxBytes){
 const source=await get(path,{access:'private'});
 if(!source||source.statusCode!==200)return null;
 let n=0;const parts=[];
 for await(const part of source.stream){
  const b=Buffer.from(part);n+=b.length;if(n>maxBytes)throw Error('원본 크기 '+maxBytes+'바이트 한도 초과');
  parts.push(b);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function one(file){
 const path=file.pathname,id=createHash('sha256').update(path).digest('hex');
 const target=CATEGORY_BASE+id+'.json';
 let existing=null;
 try{existing=await readJSON(target,170000)}catch(e){console.error('SKYNET_TOPIC_SIDECAR_READ',path,String(e.message).slice(0,120))}
 if(existing?.version===TOPIC_SCHEMA_VERSION&&existing.source===path)return {status:'cached',record:null};
 let data=await readJSON(path,24*1024*1024);
 if(!data)throw Error('원본을 읽을 수 없음');
 if(path.startsWith('skynet/document-segments/')&&!data.name){
  const hash=path.split('/')[2];
  if(/^[a-f0-9]{64}$/.test(hash)){
   const manifest=await readJSON('skynet/documents/'+hash+'.json',180000).catch(()=>null);
   if(manifest?.name)data={...data,name:manifest.name,category:manifest.category||''};
  }
 }
 // Process real text directly, without the much heavier full-text/legal index.
 // Empty/nontext manifests get a cached status so they are not re-read.
 const digest=categoryDigestEntries(sourceTopicEntries(data),{
  source:path,name:data.title||data.name||data.category||'',maxExamples:5});
 await put(target,JSON.stringify(digest),{
  access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 return {status:digest.units?'classified':'no_text',record:digest};
}
async function batchWork(files,started){
 let handled=0,classified=0,cached=0,noText=0,failed=0;
 const updates=[],errors=[];
 for(let i=0;i<files.length;i+=8){
  const group=files.slice(i,i+8);
  const done=await Promise.allSettled(group.map(one));
  for(let j=0;j<done.length;j++){
   handled++;const x=done[j];
   if(x.status==='rejected'){
    failed++;errors.push({source:group[j].pathname,error:String(x.reason?.message||x.reason).slice(0,120)});
   }else{
    if(x.value.status==='cached')cached++;
    if(x.value.status==='classified')classified++;
    if(x.value.status==='no_text')noText++;
    if(x.value.record)updates.push(x.value.record);
   }
  }
  if(Date.now()-started>TIME_BUDGET_MS)break;
 }
 return {handled,classified,cached,noText,failed,updates,errors};
}
async function countByPrefix(prefix,upperBound=200000){
 let total=0,cursor=null,pages=0;
 do{
  const result=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
  total+=result.blobs.filter(b=>b.pathname.endsWith('.json')&&!b.pathname.endsWith('/index.json')).length;
  cursor=result.hasMore?result.cursor:null;
  pages++;
 }while(cursor&&total<upperBound&&pages<250);
 return {total,complete:!cursor,pages};
}
export default async function handler(req,res){
 if(!authorize(req))return send(res,401,{error:'관리자 인증 필요'});
 if(req.method!=='POST')return send(res,405,{error:'POST only'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'비공개 기억 저장소 미연결'});
 let input=req.body;try{if(typeof input==='string')input=JSON.parse(input)}catch{return send(res,400,{error:'JSON 형식 오류'})}
 const started=Date.now();
 if(input?.action==='totals'){
  try{
   const stats=await Promise.all(ROOTS.map(async p=>[p,await countByPrefix(p)]));
   return send(res,200,{ok:true,prefixes:Object.fromEntries(stats),elapsedMs:Date.now()-started});
  }catch(e){return send(res,503,{error:'원본 개수 집계 실패',detail:String(e.message).slice(0,120)})}
 }
 const prefix=String(input?.prefix||'');
 const limit=Math.min(32,Math.max(1,Number(input?.limit)||16));
 const cursor=typeof input?.cursor==='string'&&input.cursor.length<4000?input.cursor:undefined;
 if(!ROOTS.includes(prefix))return send(res,400,{error:'분류 대상 영역 오류'});
 try{
  const page=await list({prefix,limit,...(cursor?{cursor}:{})});
  const files=page.blobs.filter(f=>f.pathname.endsWith('.json')&&!f.pathname.endsWith('/index.json'));
  const results=await batchWork(files,started);
  // A full page was read before processing. Only advance a cursor when every
  // discovered file was handled, otherwise progress could silently skip data.
  if(results.handled!==files.length)return send(res,503,{error:'배치 시간 초과: 누락 방지를 위해 재시도 필요',processed:results.handled,elapsedMs:Date.now()-started});
  return send(res,200,{
   ok:true,prefix,scanned:page.blobs.length,processed:results.handled,
   classified:results.classified,cached:results.cached,noText:results.noText,
   failed:results.failed,errors:results.errors,updates:results.updates,
   hasMore:page.hasMore,nextCursor:page.hasMore?page.cursor:null,
   elapsedMs:Date.now()-started
  });
 }catch(e){console.error('SKYNET_FAST_CATEGORY_FAILURE',prefix,String(e.message).slice(0,140));
  return send(res,503,{error:'분류 배치 처리 실패',detail:String(e.message).slice(0,130),elapsedMs:Date.now()-started})}
}
