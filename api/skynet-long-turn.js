import {createHash} from 'node:crypto';
import {get,put} from '../lib/customer-object-storage.mjs';
import {indexSource} from './skynet-search-index.js';

const ROOT='skynet/long-turn-parts/';
const TURN_ROOT='skynet/memory/turns/';
const MAX_PART_CHARS=48000;
const MAX_PARTS=160;
const MAX_STORED_BYTES=32000000;
const digest=s=>createHash('sha256').update(s).digest('hex');
const validId=s=>/^[a-zA-Z0-9_-]{12,100}$/.test(s);
const authorized=req=>{try{const h=String(req.headers.authorization||'');return Boolean(process.env.ADMIN_PASSWORD)&&h.startsWith('Basic ')&&Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}};
const send=(res,status,data)=>res.status(status).setHeader('Cache-Control','no-store').setHeader('Vary','Authorization').json(data);
async function read(path,limit=1000000){
 const result=await get(path,{access:'private'});if(!result||result.statusCode!==200)return null;
 let n=0;const chunks=[];for await(const item of result.stream){const buf=Buffer.from(item);n+=buf.length;if(n>limit)throw Error('STORED_PART_TOO_LARGE');chunks.push(buf)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const skynetLongTurnLimits={maxPartChars:MAX_PART_CHARS,maxParts:MAX_PARTS};

export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'POST_ONLY'});
 if(!authorized(req))return send(res,401,{error:'관리자 인증 필요'});
 if(process.env.SQUIDLAW_OBJECT_BACKEND&&process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia')return send(res,503,{error:'비공개 저장소 연결 필요'});
 let b=req.body;try{if(typeof b==='string')b=JSON.parse(b)}catch{return send(res,400,{error:'JSON_FORMAT_ERROR'})}
 const turnId=String(b?.turnId||''),role=String(b?.role||''),action=String(b?.action||'');
 const total=Number(b?.total),part=Number(b?.part);
 if(!validId(turnId)||!['user','assistant'].includes(role)||!Number.isSafeInteger(total)||total<1||total>MAX_PARTS)return send(res,400,{error:'INVALID_TURN'});
 if(action==='part'){
  if(!Number.isInteger(part)||part<0||part>=total||typeof b.content!=='string'||!b.content.length||b.content.length>MAX_PART_CHARS)return send(res,413,{error:'INVALID_TURN_PART'});
  const path=ROOT+turnId+'/'+role+'/'+String(part).padStart(4,'0')+'.json';
  const item={role,part,total,content:b.content,sha256:digest(b.content)};
  try{
   const existing=await read(path,500000);
   if(existing)return existing.sha256===item.sha256&&existing.total===total?send(res,200,{ok:true,duplicate:true,part}):send(res,409,{error:'TURN_PART_CONFLICT'});
   await put(path,JSON.stringify(item),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
   return send(res,200,{ok:true,part});
  }catch(e){if(/already exists|conflict|409/i.test(String(e?.message||'')))return send(res,409,{error:'TURN_PART_CONFLICT'});return send(res,502,{error:'TURN_PART_SAVE_FAILED',detail:String(e?.message||e).slice(0,100)})}
 }
 if(action!=='finalize')return send(res,400,{error:'INVALID_ACTION'});
 try{
  const path=TURN_ROOT+turnId+'/'+role+'.json';
  const existing=await read(path,MAX_STORED_BYTES+1000);
  if(existing?.messages?.[0]?.content)return send(res,200,{ok:true,duplicate:true,chars:existing.messages[0].content.length,sha256:digest(existing.messages[0].content)});
  const contents=[];
  for(let i=0;i<total;i+=8){
   const batch=await Promise.all(Array.from({length:Math.min(8,total-i)},(_,j)=>read(ROOT+turnId+'/'+role+'/'+String(i+j).padStart(4,'0')+'.json',500000)));
   for(let j=0;j<batch.length;j++){
    const item=batch[j];
    if(!item||item.role!==role||item.part!==i+j||item.total!==total||typeof item.content!=='string'||digest(item.content)!==item.sha256)
     return send(res,409,{error:'TURN_PART_MISSING_OR_CORRUPT',part:i+j});
    contents.push(item.content);
   }
  }
  const content=contents.join('');
  if(!content.trim()||Buffer.byteLength(content,'utf8')>MAX_STORED_BYTES)return send(res,413,{error:'TURN_TOO_LARGE'});
  const payload={messages:[{role,content}],turnId,savedAt:new Date().toISOString(),sourceParts:total,sha256:digest(content)};
  await put(path,JSON.stringify(payload),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
  let indexed=true;
  // An enormous transcript should not hold up a successful immutable write.
  // The original stays stored even if searchable indexing requires backfill.
  if(Buffer.byteLength(content,'utf8')<=250000)try{await indexSource(path,payload)}catch(e){indexed=false;console.error('Long turn index deferred',String(e?.message||e).slice(0,120))}
  else indexed=false;
  return send(res,200,{ok:true,chars:content.length,sha256:payload.sha256,indexed,indexDeferred:!indexed});
 }catch(e){if(/already exists|conflict|409/i.test(String(e?.message||'')))return send(res,200,{ok:true,duplicate:true});return send(res,502,{error:'TURN_FINALIZE_FAILED',detail:String(e?.message||e).slice(0,120)})}
}
