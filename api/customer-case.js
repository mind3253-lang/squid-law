import {extractPdfPages} from './customer-pdf-extract.js';
import {get,put,list,del} from '../lib/customer-object-storage.mjs';
import {documentVersion,mayDiscardAdditionalDocument} from './customer-analysis-jobs-db.js';
import {createHash,randomUUID} from 'node:crypto';
import {authenticatedUser} from './customer-auth.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const caseOk=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
export const casePrefix=(user,id)=>'squidlaw/cases/'+hash(user)+'/'+id+'/';
export const respond=(res,n,obj)=>res.status(n).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(obj);
export const guard=req=>{const user=authenticatedUser(req);if(!user)return {error:'로그인이 필요합니다.',status:401};const origin=req.headers.origin;if(origin){try{if(new URL(origin).host!==req.headers.host||new URL(origin).protocol!=='https:')return {error:'요청 출처 오류',status:403}}catch{return {error:'요청 출처 오류',status:403}}}return {user}};
export async function readJson(path){const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;let chunks=[],n=0;for await(const c of r.stream){n+=c.length;if(n>32*1024*1024)throw Error('저장된 JSON 크기 제한 초과');chunks.push(Buffer.from(c))}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
export async function all(prefix,limit=300){let cursor,rows=[];do{const r=await list({prefix,cursor,limit:100});rows.push(...r.blobs);cursor=r.hasMore?r.cursor:null}while(cursor&&rows.length<limit);return rows.slice(0,limit)}
export async function documents(user,id){const prefix=casePrefix(user,id)+'docs/';let cursor,rows=[];do{const result=await list({prefix,limit:1000,...(cursor?{cursor}:{})});rows.push(...result.blobs.filter(r=>r.pathname.endsWith('.json')));cursor=result.hasMore?result.cursor:null}while(cursor);const meta=[];for(let i=0;i<rows.length;i+=12)meta.push(...await Promise.all(rows.slice(i,i+12).map(r=>readJson(r.pathname).catch(()=>null))));return meta.filter(Boolean).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')))}
export async function messages(user,id){const rows=await all(casePrefix(user,id)+'messages/',500);const meta=await Promise.all(rows.filter(r=>r.pathname.endsWith('.json')).map(r=>readJson(r.pathname).catch(()=>null)));return meta.filter(Boolean).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))}
export async function saveMessage(user,id,role,content){const createdAt=new Date().toISOString(),uuid=randomUUID();const m={id:uuid,role,content,createdAt};await put(casePrefix(user,id)+'messages/'+createdAt.replace(/[:.]/g,'-')+'-'+uuid+'.json',JSON.stringify(m),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return m}
export default async function handler(req,res){
const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});const {user}=auth;
if(process.env.SQUIDLAW_OBJECT_BACKEND&&process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia')return respond(res,503,{error:'서버 저장소 설정 필요'});
const id=String(req.query?.caseId||'');if(!caseOk(id))return respond(res,400,{error:'사건 ID 형식 오류'});
const prefix=casePrefix(user,id);
try{const registry=await readJson(casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+id+'.json');if(!registry||registry.id!==id)return respond(res,404,{error:'등록된 사건이 없습니다'})}catch{return respond(res,502,{error:'사건 권한 확인 실패'})}
if(req.method==='GET'){
try{if(req.query?.view){const doc=String(req.query.view);if(!/^[0-9a-f-]{36}$/.test(doc))return respond(res,400,{error:'문서 ID 오류'});const meta=await readJson(prefix+'docs/'+doc+'.json');if(!meta)return respond(res,404,{error:'문서 없음'});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="document.pdf"');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
if(meta.sourceKind==='private_chunked_pdf_v1'){
 const {customerPdfChunkPaths}=await import('../lib/customer-pdf-source.mjs');
 const parts=customerPdfChunkPaths(prefix,meta.chunkUploadId,meta.sourceParts,meta.sourceChunkSize,meta.size);
 for(const part of parts){
  const blob=await get(part.pathname,{access:'private'});
  if(!blob||blob.statusCode!==200)throw Error('ORIGINAL_FRAGMENT_MISSING');
  let bytes=0;
  for await(const c of blob.stream){
   bytes+=c.length;if(bytes>part.size)throw Error('ORIGINAL_FRAGMENT_OVERSIZED');
   res.write(c);
  }
  if(bytes!==part.size)throw Error('ORIGINAL_FRAGMENT_TRUNCATED');
 }
 return res.end();
}
const blob=await get(prefix+'pdf/'+doc+'.pdf',{access:'private'});
if(!blob||blob.statusCode!==200)return respond(res,404,{error:'파일 없음'});
for await(const c of blob.stream)res.write(c);return res.end()}
return respond(res,200,{documents:await documents(user,id),messages:await messages(user,id)});
}catch(e){return respond(res,502,{error:'사건 자료 조회 실패'})}}
if(req.method!=='POST')return respond(res,405,{error:'GET/POST만 허용'});
if(Number(req.headers['content-length']||0)>8500000)return respond(res,413,{error:'PDF는 파일당 5MB 이하만 지원합니다'});
let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return respond(res,400,{error:'업로드 요청 형식 오류'})}
if(b?.action==='discard-mistaken-document'){
 const documentId=String(b.documentId||''),confirmName=String(b.confirmName||'');
 if(documentId&&!/^[0-9a-f-]{36}$/.test(documentId))return respond(res,400,{error:'문서 ID 오류'});
 try{
  const docs=await documents(user,id);
  let target=docs.find(d=>d.id===documentId);
  if(!documentId&&b.discardLatest===true){
   const ordered=[...docs].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
   const candidate=ordered[0];
   if(candidate&&ordered.length>1&&String(candidate.createdAt||'')!==String(ordered[1].createdAt||'')&&
    await mayDiscardAdditionalDocument(user,id,documentVersion(docs.filter(d=>d.id!==candidate.id)),documentVersion(docs)))target=candidate;
  }
  if(!target||(documentId&&target.name!==confirmName))return respond(res,409,{error:'최근 추가된 문서를 안전하게 특정할 수 없습니다. 기존 자료는 유지됩니다.'});
  const remaining=docs.filter(d=>d.id!==documentId);
  if(!remaining.length||!await mayDiscardAdditionalDocument(user,id,documentVersion(remaining),documentVersion(docs)))
   return respond(res,409,{code:'DISCARD_BASELINE_UNVERIFIED',error:'기존 완료 보고서의 원본을 보호하기 위해 폐기할 수 없습니다. 진행 중인 작업이 없는지 확인해 주세요.'});
  const paths=[prefix+'docs/'+target.id+'.json',prefix+'extracted/'+target.id+'.json',prefix+'pdf/'+target.id+'.pdf'];
  if(target.sourceKind==='private_chunked_pdf_v1'){
   const {customerPdfChunkPaths}=await import('../lib/customer-pdf-source.mjs');
   paths.push(...customerPdfChunkPaths(prefix,target.chunkUploadId,target.sourceParts,target.sourceChunkSize,target.size).map(x=>x.pathname));
   paths.push(prefix+'upload-receipts/'+target.chunkUploadId+'.json');
  }
  // Delete the metadata last so a partial storage failure remains visible and retryable.
  for(const path of paths.slice(1)){await del(path).catch(e=>{if(e?.code!=='ENOENT')throw e})}
  await del(paths[0]);
  await saveMessage(user,id,'system','고객 확인에 따라 잘못 첨부한 문서 '+target.name+'을 폐기했습니다.');
  return respond(res,200,{discarded:true,documentId:target.id});
 }catch(e){return respond(res,503,{code:'DISCARD_FAILED',error:'파일 폐기 처리에 실패했습니다. 다시 확인해 주세요.'})}
}
if(b?.action==='note'){
 const text=typeof b.text==='string'?b.text.trim():'';
 if(!text||text.length>9000)return respond(res,400,{error:'사건 메모는 9,000자 이내로 입력해 주세요.'});
 try{const message=await saveMessage(user,id,'user',text);return respond(res,201,{message,notice:'사건 메모가 저장되었습니다. 채팅 법률 상담은 제공하지 않습니다.'})}
 catch{return respond(res,503,{error:'사건 메모 저장 실패'})}
}
if(b?.action!=='upload'||typeof b.name!=='string'||typeof b.data!=='string'||b.data.length>7500000)return respond(res,400,{error:'업로드 형식 오류'});
const filename=b.name.replace(/[\\/\x00-\x1f]/g,'').slice(0,140);if(!/\.pdf$/i.test(filename))return respond(res,400,{error:'PDF만 지원'});
let buf;try{buf=Buffer.from(b.data,'base64')}catch{return respond(res,400,{error:'파일 디코딩 실패'})}
if(buf.length<100||buf.length>5*1024*1024||buf.subarray(0,5).toString()!=='%PDF-')return respond(res,400,{error:'유효한 5MB 이하 PDF를 첨부해 주세요'});
const sha256=hash(buf);try{const existing=await documents(user,id);const duplicate=existing.find(d=>d.sha256===sha256);if(duplicate)return respond(res,200,{document:duplicate,duplicate:true})}catch{return respond(res,502,{error:'중복 문서 조회 실패'})}
let pages=[],totalPages=0;try{({pages,totalPages}=await extractPdfPages(buf,{fastTextOnly:true}))}catch(e){const message=String(e?.message||'');const code=/worker/i.test(message)?'PDF_WORKER':/module|import|resolve/i.test(message)?'PDF_MODULE':/canvas|DOMMatrix|font/i.test(message)?'PDF_RENDER':/password|encrypt/i.test(message)?'PDF_ENCRYPTED':'PDF_PARSER';return respond(res,422,{error:'PDF 본문 추출 실패. 암호화 또는 손상된 파일인지 확인해 주세요',code})}
if(!pages.length)return respond(res,422,{error:'페이지를 읽을 수 없는 PDF입니다'});
for(const page of pages)page.textSha256=hash(String(page.text||''));
const uuid=randomUUID(),createdAt=new Date().toISOString(),meta={id:uuid,name:filename,sha256,size:buf.length,createdAt,side:'customer',pageCount:totalPages,extractedPages:pages.length,excludedPages:Math.max(0,totalPages-pages.length),readablePages:pages.filter(p=>p.text.trim().length>=15).length,status:pages.some(p=>p.text.trim().length<15)?'일부 페이지 텍스트 없음 (스캔 가능성)':'본문 추출 완료'};
try{await put(prefix+'pdf/'+uuid+'.pdf',buf,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/pdf'});await put(prefix+'extracted/'+uuid+'.json',JSON.stringify({pages}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});await put(prefix+'docs/'+uuid+'.json',JSON.stringify(meta),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return respond(res,200,{document:meta})}catch(e){return respond(res,502,{error:'PDF 서버 저장 실패'})}
}
