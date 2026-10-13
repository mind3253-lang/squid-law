import {get,put,list} from '@vercel/blob';

const SHA=/^[a-f0-9]{64}$/;
const maxChunks=250;
const send=(res,status,value)=>res.status(status).setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').setHeader('X-Content-Type-Options','nosniff').json(value);
const authorized=req=>{
 try{
  const value=String(req.headers.authorization||'');
  return !!process.env.ADMIN_PASSWORD&&value.startsWith('Basic ')&&
   Buffer.from(value.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
};
async function read(path,max=260000){
 const ref=await get(path,{access:'private'});
 if(!ref||ref.statusCode!==200)return null;
 const parts=[];let size=0;
 for await(const piece of ref.stream){
  const b=Buffer.from(piece);size+=b.length;
  if(size>max)throw Error('REVIEW_DATA_TOO_LARGE');
  parts.push(b);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
const base=(documentHash,questionHash)=>'skynet/document-review/jobs/'+documentHash+'/'+questionHash+'/';
const reviewPrefix=(documentHash,questionHash)=>'skynet/document-review/v1/'+documentHash+'/'+questionHash+'/';
const paths=(documentHash,questionHash)=>({
 manifest:base(documentHash,questionHash)+'manifest.json',
 final:base(documentHash,questionHash)+'final.json'
});
function references(value){
 const documentHash=String(value?.documentHash||''),questionHash=String(value?.questionHash||'');
 return SHA.test(documentHash)&&SHA.test(questionHash)?{documentHash,questionHash}:null;
}
async function countChunks(job){
 const prefix=reviewPrefix(job.documentHash,job.questionHash),found=new Set();
 let cursor=null,loops=0;
 do{
  const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
  for(const item of page.blobs){
   const name=item.pathname.slice(prefix.length);
   const m=/^(\d{4})-([a-f0-9]{64})\.json$/.exec(name);
   if(m&&job.chunks[Number(m[1])-1]===m[2])found.add(Number(m[1]));
  }
  cursor=page.hasMore?page.cursor:null;
  if(++loops>10)throw Error('REVIEW_RECEIPT_PAGINATION_LIMIT');
 }while(cursor);
 return {completedChunks:found.size,totalChunks:job.chunks.length,
  missingChunks:job.chunks.map((_,i)=>i+1).filter(n=>!found.has(n))};
}
export default async function handler(req,res){
 if(!authorized(req))return send(res,401,{error:'ADMIN_REQUIRED'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'STORAGE_UNAVAILABLE'});
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'GET_POST_ONLY'});
 if(req.method==='POST'&&Number(req.headers['content-length']||0)>900000)
  return send(res,413,{error:'REVIEW_REQUEST_TOO_LARGE'});
 let body=req.method==='GET'?req.query:req.body;
 if(typeof body==='string')try{body=JSON.parse(body)}catch{return send(res,400,{error:'INVALID_JSON'})}
 const ref=references(body);
 if(!ref)return send(res,400,{error:'INVALID_JOB_REFERENCE'});
 const {documentHash,questionHash}=ref,{manifest,final}=paths(documentHash,questionHash);
 try{
  const source=await read('skynet/documents/'+documentHash+'.json',27*1048576);
  if(!source||source.hash!==documentHash)return send(res,404,{error:'SOURCE_NOT_FOUND'});
  if(req.method==='POST'&&body.action==='start'){
   const chunks=body.chunks,question=String(body.question||''),effort=String(body.effort||'');
   if(!Array.isArray(chunks)||chunks.length<1||chunks.length>maxChunks||
    chunks.some(x=>!SHA.test(x))||question.length<2||question.length>5000||
    !['low','medium','high'].includes(effort)||
    !Number.isSafeInteger(source.pageCount)||!Number.isSafeInteger(source.segmentCount))
    return send(res,400,{error:'INVALID_JOB_MANIFEST'});
   const existing=await read(manifest);
   if(existing){
    if(existing.documentHash!==documentHash||existing.questionHash!==questionHash||
     JSON.stringify(existing.chunks)!==JSON.stringify(chunks)||
     existing.question!==question||existing.effort!==effort)
     return send(res,409,{error:'JOB_SOURCE_VERSION_CHANGED'});
    return send(res,200,{ok:true,reused:true,totalChunks:existing.chunks.length});
   }
   const payload={documentHash,questionHash,question,effort,chunks,
    name:source.name||'',pageCount:source.pageCount,sourceSegmentCount:source.segmentCount,
    ocrRequired:[...new Set(Array.isArray(source.ocrRequired)?source.ocrRequired:[])],
    visualVerified:false,createdAt:new Date().toISOString(),
    kind:'pdf_text_review_not_complete_visual_analysis'};
   try{
    await put(manifest,JSON.stringify(payload),{access:'private',allowOverwrite:false,
     addRandomSuffix:false,contentType:'application/json'});
   }catch(e){
    const concurrent=await read(manifest);
    if(!concurrent||JSON.stringify(concurrent.chunks)!==JSON.stringify(chunks))throw e;
    return send(res,200,{ok:true,reused:true,totalChunks:concurrent.chunks.length});
   }
   return send(res,200,{ok:true,reused:false,totalChunks:chunks.length});
  }
  const job=await read(manifest);
  if(!job)return send(res,404,{error:'REVIEW_NOT_REGISTERED'});
  const counts=await countChunks(job);
  const completed=await read(final,900000);
  if(req.method==='POST'){
   if(body.action!=='finish')return send(res,400,{error:'INVALID_JOB_ACTION'});
   if(counts.missingChunks.length)return send(res,409,{
    error:'REVIEW_TEXT_CHUNKS_INCOMPLETE',...counts});
   if(completed)return send(res,200,{ok:true,complete:true,reused:true});
   const report=String(body.report||'');
   if(report.length<100||report.length>250000)
    return send(res,400,{error:'INVALID_FINAL_REPORT'});
   const payload={documentHash,questionHash,report,finishedAt:new Date().toISOString(),
    completedChunks:counts.completedChunks,totalChunks:counts.totalChunks,
    ocrRequired:job.ocrRequired,visualVerified:false,
    status:job.ocrRequired.length?'TEXT_COMPLETE_VISUAL_PENDING':'TEXT_COMPLETE_VISUAL_NOT_VERIFIED'};
   try{
    await put(final,JSON.stringify(payload),{access:'private',allowOverwrite:false,
     addRandomSuffix:false,contentType:'application/json'});
   }catch(e){
    const concurrent=await read(final,260000);
    if(!concurrent)throw e;
   }
   return send(res,200,{ok:true,complete:true});
  }
  return send(res,200,{ok:true,found:true,name:job.name,question:job.question,
   pageCount:job.pageCount,sourceSegmentCount:job.sourceSegmentCount,...counts,complete:!!completed,
   status:completed?.status||'TEXT_REVIEW_INCOMPLETE',
   ocrRequired:job.ocrRequired,visualVerified:false,
   createdAt:job.createdAt,finishedAt:completed?.finishedAt||null,
   report:completed?.report||null});
 }catch(e){
  console.error('SKYNET_DOCUMENT_JOB_ERROR',String(e.message||e).slice(0,160));
  return send(res,503,{error:'DOCUMENT_JOB_STORAGE_UNAVAILABLE',retryable:true});
 }
}
