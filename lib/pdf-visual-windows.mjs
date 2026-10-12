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
export function mergeVisualWindows({documentId,sourcePdfSha256,pageCount,windows}){
 const pages=[],unreviewed=[],seen=new Set();
 for(const w of windows){
  if(w.documentId!==documentId||w.sourcePdfSha256!==sourcePdfSha256||!Array.isArray(w.observations?.pageObservations)||!Array.isArray(w.observations?.unreviewedPages))throw Error('VISUAL_WINDOW_SOURCE_MISMATCH');
  for(const p of w.observations.pageObservations){if(seen.has(p.page))throw Error('VISUAL_WINDOW_DUPLICATE_PAGE');seen.add(p.page);pages.push(p)}
  for(const p of w.observations.unreviewedPages){if(seen.has(p))throw Error('VISUAL_WINDOW_DUPLICATE_PAGE');seen.add(p);unreviewed.push(p)}
 }
 if(seen.size!==pageCount||[...seen].some(x=>!Number.isSafeInteger(x)||x<1||x>pageCount))throw Error('VISUAL_WINDOW_COVERAGE_MISSING');
 return {documentId,sourcePdfSha256,observations:{pageObservations:pages.sort((a,b)=>a.page-b.page),unreviewedPages:unreviewed.sort((a,b)=>a-b)},independentlyVerified:false};
}
