import {get} from '@vercel/blob';
import {readIndexedPageWindow} from '../lib/skynet-indexed-page-read.mjs';

const respond=(res,status,body)=>res.status(status)
 .setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').json(body);
const authorized=req=>{
 try{const value=String(req.headers.authorization||'');
  return !!process.env.ADMIN_PASSWORD&&value.startsWith('Basic ')&&
   Buffer.from(value.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
};
async function readJSON(path,limit=27*1048576){
 const ref=await get(path,{access:'private'});
 if(!ref||ref.statusCode!==200)return null;
 let bytes=0;const chunks=[];
 for await(const block of ref.stream){
  bytes+=block.byteLength;if(bytes>limit)throw Error('PDF_SOURCE_INDEX_BLOB_OVERSIZED');
  chunks.push(Buffer.from(block));
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function safeInt(value,max,allowNull=false){
 if(allowNull&&(value===undefined||value===null||value===''))return null;
 const number=Number(value);
 return Number.isSafeInteger(number)&&number>=0&&number<=max?number:null;
}
export default async function handler(req,res){
 if(!authorized(req))return respond(res,401,{error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return respond(res,405,{error:'GET_ONLY'});
 const hash=String(req.query?.hash||'');
 const startPage=safeInt(req.query?.startPage,1000000);
 const endPage=safeInt(req.query?.endPage,1000000);
 const rawOffset=req.query?.offset;
 const offset=rawOffset===undefined?safeInt(undefined,1000000,true):safeInt(rawOffset,1000000);
 const position=safeInt(req.query?.position??0,100000000);
 if(!/^[a-f0-9]{64}$/.test(hash)||!startPage||!endPage||startPage>endPage||
  (rawOffset!==undefined&&offset===null)||position===null)
  return respond(res,400,{error:'INVALID_PDF_PAGE_CURSOR'});
 try{
  const manifest=await readJSON('skynet/documents/'+hash+'.json');
  if(!manifest||manifest.hash!==hash)return respond(res,404,{error:'DOCUMENT_NOT_INDEXED'});
  if(!Number.isSafeInteger(manifest.segmentCount)||manifest.segmentCount<1||
   !Number.isSafeInteger(manifest.pageCount)||manifest.pageCount<1)
   return respond(res,409,{error:'PDF_SOURCE_INDEX_INCOMPLETE'});
  if(endPage>manifest.pageCount||startPage>manifest.pageCount)
   return respond(res,400,{error:'PDF_PAGE_OUT_OF_BOUNDS',pageCount:manifest.pageCount});
  const cache=new Map();
  async function readSegment(index){
   if(!Number.isSafeInteger(index)||index<0||index>=manifest.segmentCount)
    throw Error('INVALID_SOURCE_SEGMENT_CURSOR');
   const first=Math.floor(index/20)*20;
   if(!cache.has(first)){
    const path='skynet/document-segments/'+hash+'/batch-'+String(first).padStart(8,'0')+'.json';
    const value=await readJSON(path);
    if(!value||!Array.isArray(value.segments)||
     value.segments.length!==Math.min(20,manifest.segmentCount-first))
     throw Error('INDEXED_PDF_BATCH_MISSING_OR_INCOMPLETE');
    cache.set(first,value.segments);
   }
   return cache.get(first)[index-first];
  }
  const data=await readIndexedPageWindow({segmentCount:manifest.segmentCount,
   readSegment,startPage,endPage,offset,position,limit:30000});
  return respond(res,200,{ok:true,kind:'pdf_page_range',name:manifest.name||'',hash,
   pageCount:manifest.pageCount,segmentCount:manifest.segmentCount,
   startPage,endPage,ocrRequired:manifest.ocrRequired||[],...data});
 }catch(e){
  const error=String(e?.message||e).slice(0,180);
  console.error('SKYNET_PAGE_CONTEXT_FAILURE',hash.slice(0,12),startPage,endPage,error);
  return respond(res,503,{error:'PDF_PAGE_RANGE_READ_FAILED',detail:error,retryable:true});
 }
}
