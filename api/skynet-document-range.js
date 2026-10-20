import {list,get,put} from '../lib/customer-object-storage.mjs';
import {deferWork as waitUntil} from '../lib/gabia-deferred-work.mjs';
import {createHash} from 'node:crypto';
import {createArchivedPdfRangeReader} from '../lib/skynet-pdf-range.mjs';
import {extractPdfPagesByRange} from './customer-pdf-extract.js';
import {segmentRecord,auditSegments} from '../lib/record-chunks.mjs';
import {analyzeUnit,independentlyVerify} from '../lib/legal-evidence-review.mjs';
import {planVisualEvidence} from '../lib/visual-evidence.mjs';
import {indexSource} from './skynet-search-index.js';

export const maxDuration=300;
const WINDOW_PAGES=16;
const CHUNK_PARTS_PER_BLOB=20;
const respond=(res,status,value)=>res.status(status)
 .setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').json(value);
const authorized=req=>{
 try{const h=String(req.headers.authorization||'');
  return !!process.env.ADMIN_PASSWORD&&h.startsWith('Basic ')&&
   Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
};
async function readJSON(path,maxBytes=1024*1024){
 const ref=await get(path,{access:'private'});
 if(!ref||ref.statusCode!==200)return null;
 const pieces=[];let n=0;
 for await(const c of ref.stream){const b=Buffer.from(c);n+=b.length;
  if(n>maxBytes)throw Error('SOURCE_METADATA_OVERSIZED');pieces.push(b)}
 return JSON.parse(Buffer.concat(pieces).toString('utf8'));
}
async function readFragment(path,size){
 const result=await get(path,{access:'private'});
 if(!result||result.statusCode!==200)throw Error('ARCHIVE_FRAGMENT_MISSING');
 const chunks=[];let n=0;
 for await(const c of result.stream){
  const b=Buffer.from(c);n+=b.length;
  if(n>size)throw Error('ARCHIVE_FRAGMENT_OVERSIZED');
  chunks.push(b);
 }
 if(n!==size)throw Error('ARCHIVE_FRAGMENT_LENGTH_MISMATCH');
 return Buffer.concat(chunks,n);
}
async function listFragments(batch,parts){
 const prefix='skynet/uploads/'+batch+'/',found=[];
 let cursor,requests=0;
 do{
  const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
  found.push(...page.blobs.filter(f=>/^skynet\/uploads\/[a-zA-Z0-9_-]+\/\d{5}\.bin$/.test(f.pathname)));
  cursor=page.hasMore?page.cursor:null;
  if(++requests>110)throw Error('ARCHIVE_LIST_PAGINATION_LIMIT');
 }while(cursor);
 found.sort((a,b)=>a.pathname.localeCompare(b.pathname));
 if(found.length!==parts)throw Error('ARCHIVE_FRAGMENT_COUNT_MISMATCH');
 for(let i=0;i<parts;i++)
  if(found[i].pathname!==prefix+String(i).padStart(5,'0')+'.bin')
   throw Error('ARCHIVE_FRAGMENT_SEQUENCE_MISMATCH');
 return found;
}
async function digestOriginal(files){
 const sha=createHash('sha256');
 for(const file of files){
  const obj=await get(file.pathname,{access:'private'});
  if(!obj||obj.statusCode!==200)throw Error('ARCHIVE_FRAGMENT_MISSING');
  let n=0;
  for await(const c of obj.stream){n+=c.byteLength;sha.update(c)}
  if(n!==file.size)throw Error('ARCHIVE_FRAGMENT_LENGTH_MISMATCH');
 }
 return sha.digest('hex');
}
const receiptPath=(hash,startPage,mode='normal')=>
 (mode==='rebuild-v2'?'skynet/document-ingest-rebuild-v2/':'skynet/document-ingest/')+
 hash+'/step-'+String(startPage).padStart(8,'0')+'.json';
const segmentPath=(hash,start)=>
 'skynet/document-segments/'+hash+'/batch-'+String(start).padStart(8,'0')+'.json';
const summaryOf=(receipt,duplicate=false)=>({
 ok:true,hash:receipt.hash,name:receipt.name,pages:receipt.pageCount,
 processedPages:receipt.nextPage-1,nextPage:receipt.nextPage,
 segments:receipt.nextSegment,characters:receipt.characters,
 ocrRequired:receipt.ocrRequired,complete:receipt.complete===true,
 duplicate,analyzed:false,windowSize:WINDOW_PAGES,
 reason:receipt.complete===true?'PDF 텍스트 전체 색인 저장 완료; 이미지 증거 미검증':
  'PDF 페이지 구간 저장 완료; 다음 구간 계속 처리'
});
function candidateCategory(name,text){
 const s=(name+' '+text).toLowerCase();
 return /법원|소송|준비서면|피고|원고|고소/.test(s)?'법률·소송':
  /서브마린|다이빙|프리다이빙/.test(s)?'서브마린·다이빙':
  /시화성|중식당|짜장/.test(s)?'시화성·식당':'일반 자료';
}
async function persistSegmentBatch(hash,name,start,segments,createdAt){
 const reviewed=segments.map(analyzeUnit);
 const grouped=new Map();
 for(const segment of segments){
  if(!grouped.has(segment.page))grouped.set(segment.page,[]);
  grouped.get(segment.page).push(segment);
 }
 const pageStubs=[...grouped].map(([page,parts])=>({
  page,text:parts.map(p=>p.text).join(''),
  visualInventoryStatus:'visual_scan_deferred',imageOperatorCount:null
 }));
 const visualPlan=planVisualEvidence({documentId:hash,pages:pageStubs,images:[]});
 const document={
  hash,firstPage:segments[0].page,lastPage:segments.at(-1).page,segments,
  review:reviewed,visualPlan,visualInventoryComplete:false,
  verifiedText:independentlyVerify(segments,reviewed).complete,verifiedVisual:false
 };
 const path=segmentPath(hash,start);
 await put(path,JSON.stringify(document),{access:'private',addRandomSuffix:false,
  allowOverwrite:true,contentType:'application/json'});
 const text=segments.map(x=>'[PDF '+x.page+'쪽 / 부분 '+x.part+']\n'+x.text).join('\n');
 return {path,data:{name:name+' [PDF '+document.firstPage+'-'+document.lastPage+'쪽]',
  category:candidateCategory(name,text.slice(0,2000)),text,createdAt}};
}
export default async function handler(req,res){
 if(!authorized(req))return respond(res,401,{error:'ADMIN_REQUIRED'});
 if(req.method!=='POST')return respond(res,405,{error:'POST_ONLY'});
 if((process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia'&&!process.env.BLOB_READ_WRITE_TOKEN))return respond(res,503,{error:'STORAGE_UNAVAILABLE'});
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():req.body||{};
 const batch=String(body.batch||''),name=String(body.name||''),parts=Number(body.parts);
 const startPage=Number(body.startPage||1);
 const recoveryMode=body.recoveryMode==='rebuild-v2'?'rebuild-v2':'normal';
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(batch)||!/\.pdf$/i.test(name)||
  name.length>255||!Number.isSafeInteger(parts)||parts<1||parts>100000||
  !Number.isSafeInteger(startPage)||startPage<1||
  (startPage-1)%WINDOW_PAGES!==0)
  return respond(res,400,{error:'INVALID_PDF_ARCHIVE_REQUEST'});
 try{
  const found=await listFragments(batch,parts);
  const range=createArchivedPdfRangeReader(found,readFragment,{cacheLimit:3});
  const warehouse=await readJSON('skynet/warehouse/'+batch+'.json').catch(()=>null);
  const registered=warehouse?.name===name&&warehouse?.batch===batch&&
   warehouse?.parts===parts&&warehouse?.size===range.totalBytes&&
   /^[a-f0-9]{64}$/.test(String(warehouse?.hash||''));
  const hash=registered?warehouse.hash:await digestOriginal(found);
  const path='skynet/documents/'+hash+'.json';
  const manifest=await readJSON(path);
  if(manifest?.hash===hash&&Number.isInteger(manifest.pageCount)&&
   Number.isInteger(manifest.segmentCount))
   return respond(res,200,{ok:true,hash,name:manifest.name,pages:manifest.pageCount,
    processedPages:manifest.pageCount,nextPage:manifest.pageCount+1,
    segments:manifest.segmentCount,characters:manifest.characters,
    ocrRequired:manifest.ocrRequired||[],complete:true,duplicate:true,analyzed:false});
  const receipt=await readJSON(receiptPath(hash,startPage,recoveryMode),2*1048576);
  if(receipt?.hash===hash&&receipt.nextPage>startPage)
   return respond(res,200,summaryOf(receipt,true));
  const previous=startPage===1?null:
   await readJSON(receiptPath(hash,startPage-WINDOW_PAGES,recoveryMode),2*1048576);
  if(startPage!==1&&(!previous||previous.hash!==hash||previous.nextPage!==startPage))
   return respond(res,409,{error:'PREVIOUS_PDF_WINDOW_MISSING',
    nextPage:previous?.nextPage||1,recoverable:recoveryMode==='normal',
    recoveryMode,expectedPreviousStart:startPage-WINDOW_PAGES});
  const extracted=await extractPdfPagesByRange(range,{
   startPage,pageCount:WINDOW_PAGES,fastTextOnly:true
  });
  const {pages,totalPages}=extracted;
  if(startPage>totalPages||pages.length!==Math.min(WINDOW_PAGES,totalPages-startPage+1))
   throw Error('PDF_PAGE_WINDOW_INCOMPLETE');
  const units=segmentRecord({scope:'skynet',documentId:hash,pages}).segments;
  if(!auditSegments(pages,units).complete)throw Error('PDF_SEGMENT_COVERAGE_INCOMPLETE');
  const carry=previous?.carry||[];
  if(carry.length>=CHUNK_PARTS_PER_BLOB)throw Error('INVALID_PDF_SEGMENT_CARRY');
  const joined=[...carry,...units];
  let segmentOffset=(previous?.nextSegment||0)-carry.length;
  if(segmentOffset%CHUNK_PARTS_PER_BLOB!==0)throw Error('PDF_SEGMENT_OFFSET_MISMATCH');
  const indexed=[];
  const isFinal=startPage+pages.length===totalPages+1;
  const flushSize=isFinal?joined.length:
   Math.floor(joined.length/CHUNK_PARTS_PER_BLOB)*CHUNK_PARTS_PER_BLOB;
  for(let i=0;i<flushSize;i+=CHUNK_PARTS_PER_BLOB){
   const selected=joined.slice(i,i+CHUNK_PARTS_PER_BLOB);
   indexed.push(await persistSegmentBatch(hash,name,segmentOffset+i,selected,
    previous?.createdAt||new Date().toISOString()));
  }
  const nextSegment=(previous?.nextSegment||0)+units.length;
  const nextPage=startPage+pages.length;
  const characters=(previous?.characters||0)+units.reduce((n,x)=>n+x.text.length,0);
  const ocrRequired=[...(previous?.ocrRequired||[]),
   ...units.filter(x=>x.status==='ocr_required').map(x=>x.page)];
  const version=createHash('sha256').update(String(previous?.version||''))
   .update(JSON.stringify(units.map(x=>[x.page,x.part,x.hash]))).digest('hex');
  const next={
   hash,name,parts,pageCount:totalPages,nextPage,nextSegment,characters,version,
   carry:joined.slice(flushSize),ocrRequired,complete:isFinal,
   category:previous?.category||candidateCategory(name,pages.slice(0,3).map(x=>x.text).join(' ')),
   createdAt:previous?.createdAt||new Date().toISOString()
  };
  // Publish the source only after every expected page AND segment batch is
  // durably committed. A partial receipt is never exposed as a whole PDF.
  if(isFinal){
   if(next.carry.length)throw Error('PDF_SEGMENT_FINAL_CARRY_NOT_EMPTY');
   await put(path,JSON.stringify({
    name,hash,category:next.category,createdAt:next.createdAt,pageCount:totalPages,
    segmentCount:nextSegment,characters,version,ocrRequired,
    visualInventoryComplete:false,status:'text_extracted_not_fully_reviewed',
    ingestMethod:'bounded_pdf_byte_ranges',textCoverageComplete:true
   }),{access:'private',addRandomSuffix:false,allowOverwrite:true,
    contentType:'application/json'});
  }
  await put(receiptPath(hash,startPage,recoveryMode),JSON.stringify(next),{
   access:'private',addRandomSuffix:false,allowOverwrite:true,
   contentType:'application/json'
  });
  if(indexed.length){
   const indexing=Promise.allSettled(indexed.map(x=>indexSource(x.path,x.data)))
    .then(results=>{const failed=results.filter(x=>x.status==='rejected').length;
     if(failed)console.error('SKYNET_PDF_SEARCH_DEFERRED',hash.slice(0,12),failed)});
   try{waitUntil(indexing)}catch{void indexing.catch(()=>{})}
  }
  return respond(res,200,summaryOf(next));
 }catch(e){
  const message=String(e?.message||e).slice(0,170);
  console.error('SKYNET_PDF_WINDOW_FAILED',batch.slice(0,12),startPage,message);
  return respond(res,503,{error:'PDF_WINDOW_EXTRACTION_FAILED',detail:message,
   retryable:true,startPage});
 }
}
