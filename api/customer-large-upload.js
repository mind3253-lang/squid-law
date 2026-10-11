import {get,put,del} from '@vercel/blob';
import {randomUUID,createHash} from 'node:crypto';
import {extractPdfPages,inspectPdfPageCount} from './customer-pdf-extract.js';
import {guard,respond,readJson,documents,casePrefix} from './customer-case.js';
export const config={api:{bodyParser:false}};
const MAX=100*1024*1024,CHUNK=1024*1024;
async function readBody(req,limit){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>limit)throw Error('요청 용량 초과');chunks.push(Buffer.from(c))}return Buffer.concat(chunks)}
async function bytes(path){const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)throw Error('업로드 조각 누락');const parts=[];for await(const c of r.stream)parts.push(Buffer.from(c));return Buffer.concat(parts)}
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'저장소 설정 필요'});
 const id=String(req.query?.caseId||'');if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(id))return respond(res,400,{error:'사건 ID 오류'});
 const user=auth.user,prefix=casePrefix(user,id);
 try{const reg=await readJson(casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+id+'.json');if(!reg||reg.id!==id)return respond(res,404,{error:'사건 없음'})}catch{return respond(res,502,{error:'사건 확인 실패'})}
 if(req.method!=='POST')return respond(res,405,{error:'POST만 지원'});
 const uploadId=String(req.query?.uploadId||'');if(!/^[0-9a-f-]{36}$/.test(uploadId))return respond(res,400,{error:'업로드 ID 오류'});
 const action=String(req.query?.action||''),root=prefix+'chunks/'+uploadId+'/';
 try{
  if(action==='chunk'){
   const index=Number(req.query.index),total=Number(req.query.total);
   if(!Number.isInteger(index)||!Number.isInteger(total)||total<1||total>100||index<0||index>=total)return respond(res,400,{error:'조각 순서 오류'});
   const buf=await readBody(req,CHUNK+1);
   if(!buf.length||buf.length>CHUNK)return respond(res,413,{error:'조각 크기 초과'});
   await put(root+index+'.part',buf,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/octet-stream'});
   return respond(res,200,{ok:true,index});
  }
  if(action!=='complete'&&action!=='stage')return respond(res,400,{error:'동작 오류'});
  const b=JSON.parse((await readBody(req,8192)).toString('utf8'));
  const name=String(b?.name||'').replace(/[\\/\x00-\x1f]/g,'').slice(0,140),total=Number(b?.total),size=Number(b?.size);
  if(!/\.pdf$/i.test(name)||!Number.isInteger(total)||total<1||total>100||!Number.isInteger(size)||size<100||size>MAX||total!==Math.ceil(size/CHUNK))return respond(res,400,{error:'PDF 또는 용량 정보 오류'});
  const paths=Array.from({length:total},(_,i)=>root+i+'.part');
  const buffers=[];for(const path of paths)buffers.push(await bytes(path));
  const buf=Buffer.concat(buffers);
  if(buf.length!==size||buf.subarray(0,5).toString()!=='%PDF-')return respond(res,422,{error:'PDF 파일 검증 실패'});
  const sha256=createHash('sha256').update(buf).digest('hex'),existing=(await documents(user,id)).find(d=>d.sha256===sha256);
  if(existing){await Promise.allSettled(paths.map(p=>del(p)));return respond(res,200,{document:existing,duplicate:true})}
  if(action==='stage'){
   let totalPages;try{totalPages=await inspectPdfPageCount(buf)}catch{return respond(res,422,{error:'PDF 페이지 수 확인 실패'})}
   const uuid=randomUUID(),createdAt=new Date().toISOString();
   const meta={id:uuid,name,sha256,size:buf.length,createdAt,side:'customer',pageCount:totalPages,extractedPages:0,excludedPages:totalPages,readablePages:0,imageOperatorPages:0,unscannedVisualPages:totalPages,visualVerified:false,status:'extraction_pending',extractionNextPage:1};
   await put(prefix+'pdf/'+uuid+'.pdf',buf,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/pdf'});
   await put(prefix+'docs/'+uuid+'.json',JSON.stringify(meta),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
   await Promise.allSettled(paths.map(p=>del(p)));
   return respond(res,202,{document:meta,extractionPending:true});
  }

  let extracted;try{extracted=await extractPdfPages(buf)}catch{return respond(res,422,{error:'PDF 본문 추출 실패. 암호 또는 파일 손상을 확인해 주세요'})}
  const {pages,totalPages}=extracted;for(const page of pages)page.textSha256=createHash('sha256').update(String(page.text||'')).digest('hex');if(!pages.length)return respond(res,422,{error:'PDF 텍스트 추출 실패'});
  const uuid=randomUUID(),createdAt=new Date().toISOString();
  const meta={id:uuid,name,sha256,size:buf.length,createdAt,side:'customer',pageCount:totalPages,extractedPages:pages.length,excludedPages:Math.max(0,totalPages-pages.length),readablePages:pages.filter(p=>p.text.trim().length>=15).length,imageOperatorPages:pages.filter(p=>p.imageOperatorCount>0).length,unscannedVisualPages:pages.filter(p=>p.imageOperatorCount===null).length,visualVerified:false,status:totalPages>pages.length?'일부 페이지만 추출됨':pages.some(p=>p.text.trim().length<15)?'일부 페이지 텍스트 없음 (스캔 가능성)':'본문 추출 완료'};
  await put(prefix+'pdf/'+uuid+'.pdf',buf,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/pdf'});
  const serialized=JSON.stringify({pages});if(Buffer.byteLength(serialized)>16*1024*1024){const batches=[];for(let i=0;i<pages.length;i+=20){const p=prefix+'extracted/'+uuid+'/batch-'+String(i).padStart(8,'0')+'.json';await put(p,JSON.stringify({pages:pages.slice(i,i+20)}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});batches.push(p)}await put(prefix+'extracted/'+uuid+'.json',JSON.stringify({pageCount:totalPages,batches}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'})}else await put(prefix+'extracted/'+uuid+'.json',serialized,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
  await put(prefix+'docs/'+uuid+'.json',JSON.stringify(meta),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
  await Promise.allSettled(paths.map(p=>del(p)));
  return respond(res,200,{document:meta});
 }catch(e){return respond(res,502,{error:'대용량 PDF 처리 실패: '+String(e.message||e)})}
}