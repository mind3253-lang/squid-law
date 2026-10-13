import {get} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {TOPIC_IDS} from '../lib/skynet-topic-categories.mjs';
import {topicDbEnabled,topicDashboard,topicSources,resetTopicBackfill} from '../lib/skynet-topic-db.mjs';
const send=(res,n,o)=>res.status(n).setHeader('Cache-Control','private, no-store').setHeader('Vary','Authorization').json(o);
function authorized(req){
 try{const h=String(req.headers.authorization||'');return !!process.env.ADMIN_PASSWORD&&
  h.startsWith('Basic ')&&Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}
 catch{return false}
}
async function detail(source){
 const key='skynet/category-index/'+createHash('sha256').update(source).digest('hex')+'.json';
 const file=await get(key,{access:'private'});
 if(!file||file.statusCode!==200)return null;
 const chunks=[];let n=0;
 for await(const part of file.stream){
  const b=Buffer.from(part);n+=b.length;
  if(n>180000)throw Error('TOPIC_SIDECAR_TOO_LARGE');
  chunks.push(b);
 }
 const record=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(record?.source!==source||!record.counts)return null;
 return record;
}
export default async function handler(req,res){
 if(!authorized(req))return send(res,401,{error:'ADMIN_REQUIRED'});
 if(!topicDbEnabled())return send(res,503,{error:'TOPIC_INDEX_DATABASE_NOT_CONNECTED'});
 if(req.method==='POST'){
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(b?.action!=='reset')return send(res,400,{error:'UNSUPPORTED_ACTION'});
  try{await resetTopicBackfill();return send(res,200,{ok:true})}
  catch(e){return send(res,409,{error:String(e.message).slice(0,160)})}
 }
 if(req.method!=='GET')return send(res,405,{error:'GET_ONLY'});
 try{
  const topic=String(req.query?.topic||'');
  if(!topic)return send(res,200,{ok:true,...await topicDashboard()});
  if(!TOPIC_IDS.includes(topic))return send(res,400,{error:'UNKNOWN_TOPIC'});
  const offset=Number(req.query?.offset||0),limit=Math.min(40,Math.max(1,Number(req.query?.limit)||20));
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return send(res,400,{error:'INVALID_OFFSET'});
  const sourceRows=await topicSources(topic,{limit,offset});
  const records=[],errors=[];
  for(let i=0;i<sourceRows.length;i+=12){
   const chunk=sourceRows.slice(i,i+12);
   const settled=await Promise.allSettled(chunk.map(x=>detail(x.source)));
   for(let j=0;j<settled.length;j++){
    const x=settled[j];
    if(x.status==='fulfilled'&&x.value)records.push(x.value);
    else errors.push({source:chunk[j].source,reason:x.status==='rejected'?String(x.reason?.message||x.reason).slice(0,100):'SIDE_CAR_MISSING'});
   }
  }
  return send(res,200,{ok:true,topic,records,errors,offset,nextOffset:sourceRows.length===limit?offset+limit:null,hasMore:sourceRows.length===limit});
 }catch(e){console.error('SKYNET_TOPIC_DASHBOARD',String(e.message).slice(0,150));
  return send(res,503,{error:'TOPIC_DASHBOARD_UNAVAILABLE',detail:String(e.message).slice(0,150)})}
}
