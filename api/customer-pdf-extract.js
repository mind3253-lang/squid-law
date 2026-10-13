import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createHash} from 'node:crypto';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=pdfWorker;
export function countImagePaintOperations(operatorList){
 if(!Array.isArray(operatorList?.fnArray))throw Error('INVALID_PDF_OPERATORS');
 const imageOps=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintJpegXObject,OPS.paintImageMaskXObject,OPS.paintImageXObjectRepeat,OPS.paintImageMaskXObjectRepeat]);
 return operatorList.fnArray.filter(op=>imageOps.has(op)).length;
}
export function resolvePdfPageRange(totalPages,options={}){
 const startPage=options.startPage??1,pageCount=options.pageCount??totalPages;
 if(!Number.isSafeInteger(totalPages)||totalPages<1||!Number.isSafeInteger(startPage)||startPage<1||startPage>totalPages||!(pageCount===Infinity||Number.isSafeInteger(pageCount)&&pageCount>0))throw Error('INVALID_PDF_PAGE_RANGE');
 return {startPage,endPage:Math.min(totalPages,startPage+pageCount-1)};
}
export async function extractPdfPages(buffer,maxPages=Infinity){
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true});
 try{
  const pdf=await task.promise;
  const totalPages=pdf.numPages,pages=[];const fastTextOnly=typeof maxPages==='object'&&maxPages!==null&&maxPages.fastTextOnly===true;
  const range=resolvePdfPageRange(totalPages,typeof maxPages==='object'&&maxPages!==null?maxPages:{pageCount:maxPages});
  // Keep memory bounded: the underlying PDF can be up to 100 MB.
  // Independent pages can be extracted concurrently, but every output is
  // returned in page order and retains the existing visual-operator digest.
  const concurrency=fastTextOnly?4:3;
  const extractPage=async n=>{
   const page=await pdf.getPage(n);
   try{
    const content=await page.getTextContent();
    const lines=[];let lastY;
    for(const item of content.items){
     const y=item.transform?.[5];
     if(lastY!==undefined&&y!==lastY)lines.push('\n');
     lines.push(item.str||'');lastY=y;
    }
    let imageOperatorCount=null,visualInventoryStatus='operator_scan_failed';
    if(fastTextOnly){visualInventoryStatus='visual_scan_deferred'}
    else try{
     imageOperatorCount=countImagePaintOperations(await page.getOperatorList());
     visualInventoryStatus='operator_scan_unverified';
    }catch{}
    const visualOperatorDigest=createHash('sha256').update(JSON.stringify([n,imageOperatorCount,visualInventoryStatus])).digest('hex');
    return {page:n,text:lines.join(' '),imageOperatorCount,visualInventoryStatus,visualOperatorDigest};
   }finally{page.cleanup()}
  };
  for(let start=range.startPage;start<=range.endPage;start+=concurrency){
   const count=Math.min(concurrency,range.endPage-start+1);
   // allSettled finishes outstanding pdf.js tasks before the PDF is destroyed,
   // even when a page fails. Never silently skip an unreadable source page.
   const group=await Promise.allSettled(Array.from({length:count},(_,i)=>extractPage(start+i)));
   const failed=group.find(x=>x.status==='rejected');
   if(failed)throw failed.reason;
   pages.push(...group.map(x=>x.value));
  }
  return {pages,totalPages,startPage:range.startPage,endPage:range.endPage,finished:range.endPage===totalPages};
 }finally{await task.destroy()}
}

export async function inspectPdfPageCount(buffer){
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true});
 try{const pdf=await task.promise;return pdf.numPages}
 finally{await task.destroy()}
}

export function choosePdfExtractionWindow(sizeBytes){
 if(!Number.isSafeInteger(sizeBytes)||sizeBytes<1)throw Error('INVALID_PDF_SIZE');
 return sizeBytes>50*1024*1024?20:sizeBytes>20*1024*1024?40:100;
}
