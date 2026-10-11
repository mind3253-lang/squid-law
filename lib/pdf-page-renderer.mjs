import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=pdfWorker;
export async function renderPdfPageImages(buffer,{pageNumbers,canvasFactory,scale=1.5,maxPixels=10000000}={}){
 if(!buffer?.length||!Array.isArray(pageNumbers)||!pageNumbers.length||typeof canvasFactory!=='function'||!Number.isFinite(scale)||scale<=0)throw Error('INVALID_PDF_RENDER_REQUEST');
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true});
 try{
  const pdf=await task.promise,seen=new Set(),images=[];
  for(const number of pageNumbers){
   if(!Number.isSafeInteger(number)||number<1||number>pdf.numPages||seen.has(number))throw Error('INVALID_PDF_RENDER_PAGE');
   seen.add(number);
   const page=await pdf.getPage(number);
   try{
    const viewport=page.getViewport({scale});
    const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
    if(width*height>maxPixels)throw Error('PDF_RENDER_PIXEL_BUDGET');
    const canvas=await canvasFactory(width,height);
    if(!canvas?.getContext||!canvas?.toBuffer)throw Error('CANVAS_ADAPTER_UNAVAILABLE');
    const context=canvas.getContext('2d');
    await page.render({canvasContext:context,viewport}).promise;
    const bytes=canvas.toBuffer('image/png');
    if(!bytes?.length)throw Error('EMPTY_RENDERED_PAGE');
    images.push({page:number,mime:'image/png',bytes,width,height,renderStatus:'rendered_not_vision_verified'});
   }finally{page.cleanup()}
  }
  return {totalPages:pdf.numPages,images,visualVerified:false};
 }finally{await task.destroy()}
}
