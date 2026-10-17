import {get,put} from '@vercel/blob';
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {extractPdfPagesByRange} from './customer-pdf-extract.js';
import {createCustomerPdfRangeSource,hashCustomerPdfArchive} from '../lib/customer-pdf-source.mjs';
import {guard,respond,readJson,documents,casePrefix} from './customer-case.js';
export const config={api:{bodyParser:false}};
export const maxDuration=300;
// The chunk cap is an INTERNAL request transport boundary, not a limit on the
// source PDF or a tier of page-based customer billing.
const CHUNK=1024*1024,MAX_PARTS=99999;
async function readBody(req,limit){
 const chunks=[];let n=0;
 for await(const c of req){n+=c.length;if(n>limit)throw Error('요청 조각 크기 초과');chunks.push(Buffer.from(c))}
 return Buffer.concat(chunks,n);
}
const digest=data=>createHash('sha256').update(data).digest();
async function isExistingIdentical(path,data){
 const blob=await get(path,{access:'private'}).catch(()=>null);
 if(!blob||blob.statusCode!==200)return false;
 const h=createHash('sha256');let n=0;
 for await(const c of blob.stream){n+=c.length;if(n>data.length)return false;h.update(c)}
 return n===data.length&&timingSafeEqual(h.digest(),digest(data));
}
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'저장소 설정 필요'});
 const id=String(req.query?.caseId||'');
 if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(id))return respond(res,400,{error:'사건 ID 오류'});
 const user=auth.user,prefix=casePrefix(user,id);
 try{
  const reg=await readJson(casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+id+'.json');
  if(!reg||reg.id!==id)return respond(res,404,{error:'사건 없음'});
 }catch{return respond(res,502,{error:'사건 확인 실패'})}
 if(req.method!=='POST')return respond(res,405,{error:'POST만 지원'});
 const uploadId=String(req.query?.uploadId||'');
 if(!/^[0-9a-f-]{36}$/.test(uploadId))return respond(res,400,{error:'업로드 ID 오류'});
 const action=String(req.query?.action||''),root=prefix+'chunks/'+uploadId+'/';
 try{
  if(action==='chunk'){
   const index=Number(req.query.index),total=Number(req.query.total);
   if(!Number.isSafeInteger(index)||!Number.isSafeInteger(total)||
    total<1||total>MAX_PARTS||index<0||index>=total)
    return respond(res,400,{error:'조각 순서 오류'});
   const buf=await readBody(req,CHUNK+1);
   if(!buf.length||buf.length>CHUNK)return respond(res,413,{error:'전송 조각 크기 초과'});
   const path=root+index+'.part';
   try{
    await put(path,buf,{access:'private',addRandomSuffix:false,
     allowOverwrite:false,contentType:'application/octet-stream'});
   }catch(e){
    if(!await isExistingIdentical(path,buf))throw e;
   }
   return respond(res,200,{ok:true,index,alreadyStored:false});
  }
  if(action!=='stage'&&action!=='complete')return respond(res,400,{error:'동작 오류'});
  const b=JSON.parse((await readBody(req,8192)).toString('utf8'));
  const name=String(b?.name||'').replace(/[\\/\x00-\x1f]/g,'').slice(0,140);
  const total=Number(b?.total),size=Number(b?.size);
  if(!/\.pdf$/i.test(name)||!Number.isSafeInteger(total)||total<1||
   total>MAX_PARTS||!Number.isSafeInteger(size)||size<100||
   total!==Math.ceil(size/CHUNK))
   return respond(res,400,{error:'PDF 조각 또는 파일 정보 오류'});
  const receiptPath=prefix+'upload-receipts/'+uploadId+'.json';
  const prior=await readJson(receiptPath);
  if(prior){
   if(prior.name!==name||prior.size!==size||prior.total!==total)
    return respond(res,409,{error:'업로드 식별번호와 파일 정보 불일치'});
   const doc=await readJson(prefix+'docs/'+prior.documentId+'.json');
   if(!doc)return respond(res,503,{error:'업로드 상태 복구 중'});
   if(doc.sha256!==prior.sha256||doc.name!==name||doc.size!==size||doc.chunkUploadId!==uploadId||doc.sourceParts!==total||!Number.isSafeInteger(doc.pageCount)||doc.pageCount<1)return respond(res,409,{error:'업로드 영수증과 원본 정보 검증 실패'});
   return respond(res,202,{document:doc,extractionPending:doc.status==='extraction_pending',reused:true});
  }
  const source={
   sourceKind:'private_chunked_pdf_v1',chunkUploadId:uploadId,
   sourceParts:total,sourceChunkSize:CHUNK,size
  };
  // Stream every piece through SHA-256. Never construct a whole source Buffer.
  const sha256=await hashCustomerPdfArchive(prefix,source);
  const existing=(await documents(user,id)).find(d=>d.sha256===sha256);
  if(existing){
   if(!Number.isSafeInteger(existing.pageCount)||existing.pageCount<1||existing.size!==size)return respond(res,409,{error:'기존 중복 원본의 무결성 확인 실패'});
   return respond(res,200,{document:existing,duplicate:true});
  }
  const range=createCustomerPdfRangeSource(prefix,source);
  const first=await range.readRange(0,Math.min(5,range.totalBytes));
  if(Buffer.from(first).toString('ascii')!=='%PDF-')
   return respond(res,422,{error:'유효한 PDF 파일이 아니야'});
  let pageCount;
  try{
   const result=await extractPdfPagesByRange(range,{
    startPage:1,pageCount:1,fastTextOnly:true
   });
   pageCount=result.totalPages;
  }catch(e){
   console.error('CUSTOMER_PDF_RANGE_COUNT_FAILED',String(e?.message||e).slice(0,180));
   return respond(res,422,{error:'PDF 페이지 수 확인 실패 · 서버 원본 조각은 보존됨'});
  }
  if(!Number.isSafeInteger(pageCount)||pageCount<1)throw Error('INVALID_PDF_PAGE_COUNT');
  const uuid=randomUUID(),createdAt=new Date().toISOString();
  const meta={
   id:uuid,name,sha256,size,createdAt,side:'customer',
   pageCount,extractedPages:0,excludedPages:0,pendingPages:pageCount,
   readablePages:0,imageOperatorPages:0,unscannedVisualPages:pageCount,
   visualVerified:false,status:'extraction_pending',extractionNextPage:1,
   ...source
  };
  await put(prefix+'docs/'+uuid+'.json',JSON.stringify(meta),{
   access:'private',addRandomSuffix:false,allowOverwrite:false,
   contentType:'application/json'
  });
  await put(receiptPath,JSON.stringify({documentId:uuid,name,size,total,sha256}),{
   access:'private',addRandomSuffix:false,allowOverwrite:true,
   contentType:'application/json'
  });
  return respond(res,202,{document:meta,extractionPending:true});
 }catch(e){
  console.error('CUSTOMER_PDF_MULTIPART',String(e?.message||e).slice(0,160));
  return respond(res,502,{
   error:'PDF 원본 저장 또는 등록 오류: '+String(e?.message||e).slice(0,145),
   retryable:true,originalChunksPreserved:true
  });
 }
}
