import {get,put} from '../lib/customer-object-storage.mjs';

const reply=(res,status,data)=>res.status(status).setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').setHeader('X-Content-Type-Options','nosniff').json(data);
function authorized(req){
 try{
  const header=String(req.headers.authorization||'');
  return !!process.env.ADMIN_PASSWORD&&header.startsWith('Basic ')&&
   Buffer.from(header.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
}
async function load(path,limit=220000){
 const object=await get(path,{access:'private'});
 if(!object||object.statusCode!==200)return null;
 const buffers=[];let bytes=0;
 for await(const chunk of object.stream){
  const part=Buffer.from(chunk);bytes+=part.length;
  if(bytes>limit)throw Error('REVIEW_RECEIPT_TOO_LARGE');
  buffers.push(part);
 }
 return JSON.parse(Buffer.concat(buffers).toString('utf8'));
}
const SHA=/^[a-f0-9]{64}$/;
function fields(value){
 const documentHash=String(value?.documentHash||'');
 const questionHash=String(value?.questionHash||'');
 const chunkHash=String(value?.chunkHash||'');
 const chunkNumber=Number(value?.chunkNumber);
 if(!SHA.test(documentHash)||!SHA.test(questionHash)||!SHA.test(chunkHash)||
  !Number.isSafeInteger(chunkNumber)||chunkNumber<1||chunkNumber>250)return null;
 return {documentHash,questionHash,chunkHash,chunkNumber,
  path:'skynet/document-review/v1/'+documentHash+'/'+questionHash+'/' +
   String(chunkNumber).padStart(4,'0')+'-'+chunkHash+'.json'};
}
export default async function handler(req,res){
 if(!authorized(req))return reply(res,401,{error:'ADMIN_REQUIRED'});
 if((process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia'&&!process.env.BLOB_READ_WRITE_TOKEN))return reply(res,503,{error:'STORAGE_NOT_CONFIGURED'});
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'GET_OR_POST_ONLY'});
 if(req.method==='POST'&&Number(req.headers['content-length']||0)>180000)
  return reply(res,413,{error:'RECEIPT_TOO_LARGE'});
 let input=req.method==='GET'?req.query:req.body;
 if(req.method==='POST'&&typeof input==='string')try{input=JSON.parse(input)}catch{return reply(res,400,{error:'INVALID_JSON'})}
 const data=fields(input);
 if(!data)return reply(res,400,{error:'INVALID_REVIEW_REFERENCE'});
 try{
  // Content-addressed receipts are only useful if the original source remains.
  const manifest=await load('skynet/documents/'+data.documentHash+'.json',27*1048576);
  if(!manifest||manifest.hash!==data.documentHash)
   return reply(res,404,{error:'SOURCE_DOCUMENT_NOT_FOUND'});
  const existing=await load(data.path);
  if(req.method==='GET')return reply(res,200,{
   ok:true,found:!!existing,summary:existing?.summary||null,
   pages:existing?.pages||[],reviewStatus:existing?.reviewStatus||null
  });
  if(existing)return reply(res,200,{ok:true,reused:true,summary:existing.summary,
   pages:existing.pages||[],reviewStatus:existing.reviewStatus});
  const summary=String(input.summary||'');
  const pages=input.pages;
  if(summary.trim().length<20||summary.length>50000||
   !Array.isArray(pages)||pages.length>250||
   pages.some(x=>!Number.isSafeInteger(x)||x<1||x>(manifest.pageCount||1000000)))
   return reply(res,400,{error:'INVALID_REVIEW_RECEIPT'});
  const receipt={documentHash:data.documentHash,questionHash:data.questionHash,
   chunkHash:data.chunkHash,chunkNumber:data.chunkNumber,summary,pages,
   reviewStatus:'AI_DRAFT_NOT_INDEPENDENTLY_VERIFIED',savedAt:new Date().toISOString()};
  try{
   await put(data.path,JSON.stringify(receipt),{access:'private',
    allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
  }catch(e){
   // Another tab may have committed this exact review concurrently.
   const persisted=await load(data.path);
   if(persisted)return reply(res,200,{ok:true,reused:true,summary:persisted.summary,
    pages:persisted.pages||[],reviewStatus:persisted.reviewStatus});
   throw e;
  }
  return reply(res,200,{ok:true,reused:false,reviewStatus:receipt.reviewStatus});
 }catch(e){
  console.error('SKYNET_DOCUMENT_REVIEW_STORE_ERROR',String(e?.message||'UNKNOWN').slice(0,140));
  return reply(res,503,{error:'REVIEW_CHECKPOINT_UNAVAILABLE',retryable:true});
 }
}
