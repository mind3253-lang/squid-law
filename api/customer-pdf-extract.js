import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
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
  for(let n=1;n<=Math.min(totalPages,maxPages);n++){
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
   pages.push({page:n,text:lines.join(' '),imageOperatorCount,visualInventoryStatus});
   page.cleanup();
  }
  return {pages,totalPages};
 }finally{await task.destroy()}
}
