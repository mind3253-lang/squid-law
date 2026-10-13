import {get} from '@vercel/blob';

// Single-source, bounded reconstruction: the browser no longer needs to make
// repeated cursor requests just to assemble an already-indexed PDF.
// This endpoint never performs AI analysis. OCR and image verification remain
// explicitly separate from text coverage.
const MAX_TEXT=104000;
const respond=(res,status,data)=>res.status(status).setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').setHeader('X-Content-Type-Options','nosniff').json(data);
function isAuthorized(req){
 try{
  const h=String(req.headers.authorization||'');
  return !!process.env.ADMIN_PASSWORD&&h.startsWith('Basic ')&&
   Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
}
async function readJSON(path,max=27*1048576){
 const object=await get(path,{access:'private'});
 if(!object||object.statusCode!==200)return null;
 let bytes=0;const parts=[];
 for await(const part of object.stream){
  const b=Buffer.from(part);bytes+=b.length;
  if(bytes>max)throw Error('DOCUMENT_SOURCE_OVERSIZED');
  parts.push(b);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function textPages(manifest){
 if(!Number.isSafeInteger(manifest.segmentCount)||manifest.segmentCount<1||
  !Number.isSafeInteger(manifest.pageCount)||manifest.pageCount<1||
  manifest.segmentCount>1000000)return null;
 return Array.from({length:Math.ceil(manifest.segmentCount/20)},(_,i)=>i*20);
}
export default async function handler(req,res){
 if(!isAuthorized(req))return respond(res,401,{error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return respond(res,405,{error:'GET_ONLY'});
 const hash=String(req.query?.hash||'');
 if(!/^[a-f0-9]{64}$/.test(hash))return respond(res,400,{error:'INVALID_SOURCE_HASH'});
 try{
  const manifest=await readJSON('skynet/documents/'+hash+'.json');
  if(!manifest||manifest.hash!==hash)return respond(res,404,{error:'DOCUMENT_NOT_FOUND'});
  const starts=textPages(manifest);
  if(!starts)return respond(res,409,{error:'NOT_AN_INDEXED_PDF'});
  if(Number(manifest.characters)>MAX_TEXT)
   return respond(res,413,{error:'FULL_TEXT_TOO_LARGE',limit:MAX_TEXT,
    totalCharacters:manifest.characters,retryable:false,mode:'segmented'});
  const pageNumbers=new Set(),ocrPages=Array.isArray(manifest.ocrRequired)?
   [...new Set(manifest.ocrRequired.filter(n=>Number.isSafeInteger(n)&&n>0&&n<=manifest.pageCount))]:[];
  let text='',count=0;const textLengths=new Map();
  // Independent Blob reads can be batched, but total source text and memory
  // are capped. Buffer batches are appended in the original document order.
  for(let groupStart=0;groupStart<starts.length;groupStart+=4){
   const batch=await Promise.all(starts.slice(groupStart,groupStart+4).map(async first=>{
    const path='skynet/document-segments/'+hash+'/batch-'+String(first).padStart(8,'0')+'.json';
    const data=await readJSON(path);
    if(!data||!Array.isArray(data.segments)||
     data.segments.length!==Math.min(20,manifest.segmentCount-first))
     throw Error('SOURCE_SEGMENT_BATCH_MISSING_'+first);
    return {first,segments:data.segments};
   }));
   for(const {first,segments} of batch){
    for(let index=0;index<segments.length;index++){
     const item=segments[index],page=Number(item?.page);
     if(!item||!Number.isSafeInteger(page)||page<1||page>manifest.pageCount||
      typeof item.text!=='string')throw Error('SOURCE_SEGMENT_INVALID_'+(first+index));
     const marker='\n[PDF '+page+'쪽 · 원문 부분 '+String(item.part??first+index)+']\n';
     text+=marker+item.text+'\n';
     if(text.length>MAX_TEXT)return respond(res,413,{
      error:'FULL_TEXT_TOO_LARGE',limit:MAX_TEXT,totalCharacters:text.length,
      retryable:false,mode:'segmented'
     });
     pageNumbers.add(page);textLengths.set(page,(textLengths.get(page)||0)+item.text.length);count++;
    }
   }
  }
  if(count!==manifest.segmentCount||pageNumbers.size!==manifest.pageCount||
   Array.from({length:manifest.pageCount},(_,i)=>i+1).some(n=>!pageNumbers.has(n)))
   throw Error('SOURCE_PAGE_AND_SEGMENT_COVERAGE_INCOMPLETE');
  if(!text.trim())return respond(res,409,{error:'DOCUMENT_TEXT_EMPTY'});
  return respond(res,200,{ok:true,kind:'pdf',mode:'whole_extracted_text',hash,
   name:manifest.name||'',pageCount:manifest.pageCount,segmentCount:count,
   totalCharacters:text.length,text,pageNumbers:[...pageNumbers].sort((a,b)=>a-b),
   sparseTextPages:[...textLengths].filter(([,characters])=>characters<180)
    .map(([page])=>page).sort((a,b)=>a-b),
   ocrRequired:ocrPages,visualVerified:false,textSourceComplete:true,
   note:'Full indexed text only; images, handwriting and OCR-required pages are not verified'});
 }catch(e){
  console.error('SKYNET_DOCUMENT_FULLTEXT',hash.slice(0,12),String(e?.message||e).slice(0,150));
  return respond(res,503,{error:'DOCUMENT_FULLTEXT_UNAVAILABLE',retryable:true});
 }
}
