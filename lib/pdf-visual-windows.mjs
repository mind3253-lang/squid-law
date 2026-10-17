import {PDFDocument} from 'pdf-lib';
import {createHash} from 'node:crypto';
export async function splitPdfVisualWindow({pdfBytes,startPage,pageCount=12}){
 if(!Number.isSafeInteger(startPage)||startPage<1||!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>20)throw Error('INVALID_VISUAL_WINDOW');
 const source=await PDFDocument.load(pdfBytes,{ignoreEncryption:false});
 const totalPages=source.getPageCount();
 if(startPage>totalPages)throw Error('VISUAL_WINDOW_OUT_OF_RANGE');
 const endPage=Math.min(totalPages,startPage+pageCount-1);
 const out=await PDFDocument.create();
 const copied=await out.copyPages(source,Array.from({length:endPage-startPage+1},(_,i)=>startPage-1+i));
 for(const p of copied)out.addPage(p);
 const bytes=Buffer.from(await out.save({useObjectStreams:true}));
 return {bytes,startPage,endPage,totalPages,originalSha256:createHash('sha256').update(pdfBytes).digest('hex')};
}
/**
 * Produce multiple independent 12-page visual review windows from one verified
 * source parse. Every returned part has its original 1-based start/end page.
 * Pages are never dropped, reordered or merged into a larger provider request.
 */
export async function splitPdfVisualWindows({pdfBytes,startPage,count=3,pageCount=12}){
 if(!Number.isSafeInteger(startPage)||startPage<1||
  !Number.isSafeInteger(count)||count<1||count>4||
  !Number.isSafeInteger(pageCount)||pageCount<1||pageCount>20)
  throw Error('INVALID_VISUAL_WINDOW_GROUP');
 const source=await PDFDocument.load(pdfBytes,{ignoreEncryption:false});
 const totalPages=source.getPageCount();
 if(startPage>totalPages)throw Error('VISUAL_WINDOW_OUT_OF_RANGE');
 const originalSha256=createHash('sha256').update(pdfBytes).digest('hex');
 const windows=[];
 for(let first=startPage;first<=totalPages&&windows.length<count;first+=pageCount){
  const last=Math.min(totalPages,first+pageCount-1);
  const out=await PDFDocument.create();
  const copied=await out.copyPages(source,
   Array.from({length:last-first+1},(_,i)=>first-1+i));
  for(const p of copied)out.addPage(p);
  windows.push({bytes:Buffer.from(await out.save({useObjectStreams:true})),
   startPage:first,endPage:last,totalPages,originalSha256});
 }
 return windows;
}
/**
 * Render sparse OCR target pages as separate, single-page PDF attachments,
 * parsing the original PDF exactly once. Original page numbers are preserved.
 */
export async function splitPdfVisualPageSet({pdfBytes,pages}){
 if(!Array.isArray(pages)||!pages.length||pages.length>4||
  pages.some(n=>!Number.isSafeInteger(n)||n<1)||
  new Set(pages).size!==pages.length)throw Error('INVALID_OCR_PAGE_SET');
 const source=await PDFDocument.load(pdfBytes,{ignoreEncryption:false});
 const totalPages=source.getPageCount();
 if(pages.some(n=>n>totalPages))throw Error('OCR_PAGE_OUT_OF_RANGE');
 const originalSha256=createHash('sha256').update(pdfBytes).digest('hex');
 const windows=[];
 for(const page of pages){
  const out=await PDFDocument.create();
  const [copied]=await out.copyPages(source,[page-1]);
  out.addPage(copied);
  windows.push({bytes:Buffer.from(await out.save({useObjectStreams:true})),
   startPage:page,endPage:page,totalPages,originalSha256});
 }
 return windows;
}
export function mergeVisualWindows({documentId,sourcePdfSha256,pageCount,windows}){
 const pages=[],unreviewed=[],seen=new Set();
 for(const [i,w] of windows.entries()){
  const first=w.startPage??i*12+1,last=w.endPage??Math.min(pageCount,first+11);
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<1||last<first||last>pageCount)throw Error('VISUAL_WINDOW_INVALID_SOURCE_RANGE');
  if(w.documentId!==documentId||w.sourcePdfSha256!==sourcePdfSha256||!Array.isArray(w.observations?.pageObservations)||!Array.isArray(w.observations?.unreviewedPages))throw Error('VISUAL_WINDOW_SOURCE_MISMATCH');
  for(const p of w.observations.pageObservations){if(!Number.isSafeInteger(p.page)||p.page<first||p.page>last)throw Error('VISUAL_WINDOW_PAGE_OUT_OF_RANGE');if(seen.has(p.page))throw Error('VISUAL_WINDOW_DUPLICATE_PAGE');seen.add(p.page);pages.push(p)}
  for(const p of w.observations.unreviewedPages){if(!Number.isSafeInteger(p)||p<first||p>last)throw Error('VISUAL_WINDOW_PAGE_OUT_OF_RANGE');if(seen.has(p))throw Error('VISUAL_WINDOW_DUPLICATE_PAGE');seen.add(p);unreviewed.push(p)}
 }
 if(seen.size!==pageCount||[...seen].some(x=>!Number.isSafeInteger(x)||x<1||x>pageCount))throw Error('VISUAL_WINDOW_COVERAGE_MISSING');
 return {documentId,sourcePdfSha256,observations:{pageObservations:pages.sort((a,b)=>a.page-b.page),unreviewedPages:unreviewed.sort((a,b)=>a-b)},independentlyVerified:false};
}
