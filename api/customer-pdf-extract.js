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
  const totalPages=pdf.numPages,pages=[];
  const range=resolvePdfPageRange(totalPages,typeof maxPages==='object'&&maxPages!==null?maxPages:{pageCount:maxPages});
  for(let n=range.startPage;n<=range.endPage;n++){
   const page=await pdf.getPage(n);
   const content=await page.getTextContent();
   const lines=[];let lastY;
   for(const item of content.items){
    const y=item.transform?.[5];
    if(lastY!==undefined&&y!==lastY)lines.push('\n');
    lines.push(item.str||'');lastY=y;
   }
   let imageOperatorCount=null,visualInventoryStatus='operator_scan_failed';
   try{imageOperatorCount=countImagePaintOperations(await page.getOperatorList());visualInventoryStatus='operator_scan_unverified'}catch{}
   const visualOperatorDigest=createHash('sha256').update(JSON.stringify([n,imageOperatorCount,visualInventoryStatus])).digest('hex');
   pages.push({page:n,text:lines.join(' '),imageOperatorCount,visualInventoryStatus,visualOperatorDigest});
   page.cleanup();
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
