import {randomUUID,createHash} from 'node:crypto';
import {put} from '@vercel/blob';
import {searchIndexMulti} from './skynet-search-index.js';
import {sourceKind} from '../lib/skynet-evidence-rank.mjs';

const send=(res,status,body)=>res.status(status).setHeader('Cache-Control','no-store').setHeader('Vary','Authorization').json(body);
function authorized(req){
 try{
  const h=String(req.headers.authorization||'');
  return Boolean(process.env.ADMIN_PASSWORD)&&h.startsWith('Basic ')&&Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
}
export const queryDigest=s=>createHash('sha256').update(String(s||'').normalize('NFKC')).digest('hex');
export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'POST_ONLY'});
 if(!authorized(req))return send(res,401,{error:'ADMIN_REQUIRED'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'MEMORY_STORAGE_REQUIRED'});
 let b=req.body;
 try{if(typeof b==='string')b=JSON.parse(b)}catch{return send(res,400,{error:'INVALID_JSON'})}
 const queries=b?.queries;
 if(!Array.isArray(queries)||queries.length<2||queries.length>24||queries.some(q=>typeof q!=='string'||!q.trim()||q.length>8000))return send(res,400,{error:'INVALID_SEARCH_BATCH'});
 if(Buffer.byteLength(JSON.stringify(queries),'utf8')>180000)return send(res,413,{error:'SEARCH_BATCH_TOO_LARGE'});
 try{
  const indexed=await searchIndexMulti(queries,{maxResults:48});
  const id=randomUUID().replace(/-/g,'');
  const expiresAt=Date.now()+30*60000;
  const items=queries.map((query,i)=>({queryHash:queryDigest(query),sources:indexed[i]||[]}));
  const payload={id,createdAt:new Date().toISOString(),expiresAt,items};
  await put('skynet/recall-batches/'+id+'.json',JSON.stringify(payload),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
  return send(res,200,{ok:true,batchId:id,expiresAt,summary:items.map((item,i)=>({item:i,count:item.sources.length,independent:item.sources.filter(x=>sourceKind(x.source)!=='memory').length}))});
 }catch(e){
  console.error('SKYNET_BATCH_RETRIEVAL_FAILED',String(e?.message||e).slice(0,140));
  return send(res,503,{error:'BATCH_RETRIEVAL_UNAVAILABLE',retryable:true});
 }
}
