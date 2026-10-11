import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=pdfWorker;
const imageOps=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject,OPS.paintImageXObjectRepeat,OPS.paintImageMaskXObjectRepeat,OPS.paintInlineImageXObjectGroup].filter(Number.isInteger));
export async function inspectPdfVisualPages(buffer,{startPage=1,endPage=Infinity}={}){
 if(!buffer?.length||!Number.isSafeInteger(startPage)||startPage<1)throw Error('INVALID_PDF_VISUAL_RANGE');
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true});
 try{
  const pdf=await task.promise;
  const stop=Math.min(pdf.numPages,endPage);
  if(startPage>stop)throw Error('INVALID_PDF_VISUAL_RANGE');
  const pages=[];
  for(let number=startPage;number<=stop;number++){
   const page=await pdf.getPage(number);
   try{
    const ops=await page.getOperatorList();
    const counts={imagePaintOperations:0,vectorOperations:0};
    for(const fn of ops.fnArray){if(imageOps.has(fn))counts.imagePaintOperations++;else counts.vectorOperations++}
    pages.push({page:number,...counts,hasImagePaintOperations:counts.imagePaintOperations>0,requiresVisualReview:true,inventoryStatus:'operator_scan_only',verified:false});
   }finally{page.cleanup()}
  }
  return {totalPages:pdf.numPages,scannedPages:pages.length,pages,verified:false,warning:'Image painting operators are hints, not a complete extracted image inventory or visual interpretation.'};
 }finally{await task.destroy()}
}
