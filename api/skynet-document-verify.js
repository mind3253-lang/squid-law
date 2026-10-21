import {get,list} from '../lib/customer-object-storage.mjs';
const SHA=/^[a-f0-9]{64}$/;
const send=(res,status,data)=>res.status(status).setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').setHeader('X-Content-Type-Options','nosniff').json(data);
function authorized(req){try{
 const v=String(req.headers.authorization||'');
 return !!process.env.ADMIN_PASSWORD&&v.startsWith('Basic ')&&
  Buffer.from(v.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
}catch{return false}}
async function read(path){
 const o=await get(path,{access:'private'});
 if(!o||o.statusCode!==200)return null;
 const parts=[];let size=0;
 for await(const x of o.stream){const b=Buffer.from(x);size+=b.length;
  if(size>1024*1024)throw Error('SOURCE_METADATA_OVERSIZED');parts.push(b)}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function scan(prefix){
 const items=[];let cursor,passes=0;
 do{
  const p=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
  items.push(...p.blobs);cursor=p.hasMore?p.cursor:null;
  if(++passes>100)throw Error('SOURCE_LIST_LIMIT');
 }while(cursor);
 return items;
}
export default async function handler(req,res){
 if(!authorized(req))return send(res,401,{error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return send(res,405,{error:'GET_ONLY'});
 if((process.env.SQUIDLAW_OBJECT_BACKEND&&process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia'))return send(res,503,{error:'STORAGE_UNAVAILABLE'});
 const hash=String(req.query?.hash||'');
 if(!SHA.test(hash))return send(res,400,{error:'INVALID_HASH'});
 try{
  const manifest=await read('skynet/documents/'+hash+'.json');
  if(!manifest)return send(res,404,{error:'INDEX_NOT_FOUND',verified:false});
  if(manifest.hash!==hash||!/\.pdf$/i.test(String(manifest.name||''))||
   !Number.isSafeInteger(manifest.pageCount)||manifest.pageCount<1||
   !Number.isSafeInteger(manifest.segmentCount)||manifest.segmentCount<1||
   manifest.textCoverageComplete!==true)
   return send(res,409,{error:'INDEX_NOT_COMPLETE',verified:false});
  const prefix='skynet/document-segments/'+hash+'/';
  const objects=new Map((await scan(prefix)).map(x=>[x.pathname,x]));
  const missing=[];
  for(let i=0;i<manifest.segmentCount;i+=20){
   const filename=prefix+'batch-'+String(i).padStart(8,'0')+'.json';
   if(!objects.get(filename)?.size)missing.push(filename);
  }
  if(missing.length)return send(res,409,{error:'INDEX_SEGMENTS_MISSING',
   verified:false,missingBatches:missing.length});
  // Look up the actual raw upload registration by immutable original SHA.
  // Searching a Genome/chat record alone is not evidence that bytes remain.
  let originalVerified=false;
  let batch=String(req.query?.batch||''),parts=Number(req.query?.parts);
  if(batch||req.query?.parts!==undefined){
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(batch)||!Number.isSafeInteger(parts)||
    parts<1||parts>99999)return send(res,400,{error:'INVALID_ORIGINAL_REFERENCE'});
  }else{
   const registered=await scan('skynet/warehouse/');
   for(let i=0;i<registered.length;i+=24){
    const rows=await Promise.all(registered.slice(i,i+24).map(x=>
     read(x.pathname).catch(()=>null)));
    const match=rows.find(x=>x?.hash===hash&&
     /^[a-zA-Z0-9_-]{8,80}$/.test(String(x?.batch||''))&&
     Number.isSafeInteger(x?.parts)&&x.parts>0&&x.parts<=99999);
    if(match){batch=match.batch;parts=match.parts;break}
   }
  }
  if(batch&&Number.isSafeInteger(parts)&&parts>0){
   const reg=await read('skynet/warehouse/'+batch+'.json');
   if(reg?.hash===hash&&reg?.batch===batch&&reg?.parts===parts&&
    Number.isSafeInteger(reg.size)&&reg.size>0){
    const uploads=new Map((await scan('skynet/uploads/'+batch+'/')).map(x=>[x.pathname,x]));
    let bytes=0;originalVerified=true;
    for(let i=0;i<parts;i++){
     const o=uploads.get('skynet/uploads/'+batch+'/'+String(i).padStart(5,'0')+'.bin');
     if(!o||!o.size){originalVerified=false;break}bytes+=o.size;
    }
    if(bytes!==reg.size)originalVerified=false;
   }
  }
  return send(res,200,{ok:true,verified:true,scope:'indexed-pdf-text',
   hash,name:manifest.name,pageCount:manifest.pageCount,
   segmentCount:manifest.segmentCount,verifiedBatches:Math.ceil(manifest.segmentCount/20),
   originalVerified,visualVerified:manifest.visualInventoryComplete===true,
   ocrRequiredCount:Array.isArray(manifest.ocrRequired)?manifest.ocrRequired.length:0});
 }catch(e){
  console.error('SKYNET_SOURCE_VERIFY_FAILED',hash.slice(0,12),String(e?.message||e).slice(0,120));
  return send(res,503,{error:'SOURCE_VERIFY_UNAVAILABLE',verified:false});
 }
}