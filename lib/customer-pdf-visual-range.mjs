import {getDocument,PDFDataRangeTransport} from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {PDFDocument} from 'pdf-lib';
if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=pdfWorker;

/**
 * Visual PDF windows for arbitrarily large private multipart sources.
 *
 * Re-renders selected source pages to a small new PDF (one source page per
 * output page) instead of using pdf-lib to load the entire original.
 * The raster derivative is ONLY a visual-review transport. The immutable
 * archived PDF and source page numbers remain the legal evidence of record.
 */
async function renderWindow(source,pages,{originalSha256,scale=1.5}={}){
 if(!Number.isSafeInteger(source?.totalBytes)||source.totalBytes<5||
  typeof source.readRange!=='function'||!Array.isArray(pages)||!pages.length||
  pages.length>20||new Set(pages).size!==pages.length||
  pages.some(x=>!Number.isSafeInteger(x)||x<1))
  throw Error('INVALID_RANGE_VISUAL_WINDOW');
 if(!/^[a-f0-9]{64}$/.test(originalSha256||''))
  throw Error('MISSING_ORIGINAL_PDF_DIGEST');
 const {createCanvas}=await import('@napi-rs/canvas');
 const aborted={value:false};
 let rejectRange;
 const failedRange=new Promise((_,reject)=>{rejectRange=reject});
 const transport=new PDFDataRangeTransport(source.totalBytes,new Uint8Array(0),true);
 transport.requestDataRange=(begin,end)=>{
  Promise.resolve().then(()=>source.readRange(begin,end)).then(bytes=>{
   if(aborted.value)return;
   if(!(bytes instanceof Uint8Array)||bytes.length!==end-begin)
    throw Error('INVALID_PDF_RANGE_FRAGMENT');
   transport.onDataRange(begin,bytes);
  }).catch(e=>{if(!aborted.value){aborted.value=true;rejectRange(e)}});
 };
 transport.abort=()=>{aborted.value=true};
 const task=getDocument({range:transport,disableAutoFetch:true,disableStream:true,
  rangeChunkSize:262144,useSystemFonts:true,disableFontFace:true});
 try{
  const pdf=await Promise.race([task.promise,failedRange]);
  const totalPages=pdf.numPages;
  if(pages.some(p=>p>totalPages))throw Error('VISUAL_PAGE_OUT_OF_RANGE');
  const out=await PDFDocument.create();
  for(const number of pages){
   const page=await Promise.race([pdf.getPage(number),failedRange]);
   try{
    const viewportOriginal=page.getViewport({scale:1});
    const multiplier=Math.min(scale,1850/Math.max(viewportOriginal.width,viewportOriginal.height));
    const viewport=page.getViewport({scale:Math.max(0.4,multiplier)});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const ctx=canvas.getContext('2d');
    // White PDF background, including transparent source contents.
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    await Promise.race([page.render({canvasContext:ctx,viewport,
     background:'#ffffff'}).promise,failedRange]);
    const jpeg=canvas.toBuffer('image/jpeg',85);
    const embedded=await out.embedJpg(jpeg);
    const dest=out.addPage([viewportOriginal.width,viewportOriginal.height]);
    dest.drawImage(embedded,{x:0,y:0,width:dest.getWidth(),height:dest.getHeight()});
   }finally{page.cleanup()}
  }
  const bytes=Buffer.from(await out.save({useObjectStreams:true}));
  // The model-side PDF upload allows 50MB per bounded window.
  // An exceptionally dense window is retried in smaller page groups; never
  // trim pages silently.
  if(bytes.length>48*1024*1024)throw Error('VISUAL_WINDOW_SPLIT_REQUIRED');
  return {bytes,totalPages,originalSha256,renderedFromOriginal:true,
   sourcePages:pages,visualDerivative:'raster_from_verified_byte_ranges'};
 }finally{await task.destroy()}
}
export async function splitRangeVisualWindows({source,sha256,startPage,count=3,pageCount=12}){
 if(!Number.isSafeInteger(startPage)||startPage<1||
  !Number.isSafeInteger(count)||count<1||count>4||
  !Number.isSafeInteger(pageCount)||pageCount<1||pageCount>20)
  throw Error('INVALID_VISUAL_WINDOW_GROUP');
 const items=[];
 for(let i=0;i<count;i++){
  const start=startPage+i*pageCount;
  // On last document page, PDF.js rejects out-of-range pages. The count is
  // supplied by verified customer metadata, not inferred from file size.
  const last=Math.min(source.pageCount,start+pageCount-1);
  if(start>last)break;
  const pages=Array.from({length:last-start+1},(_,j)=>start+j);
  const rendered=await renderWindow(source.reader,pages,{originalSha256:sha256});
  if(rendered.totalPages!==source.pageCount)
   throw Error('VISUAL_SOURCE_PAGE_COUNT_CHANGED');
  items.push({...rendered,startPage:start,endPage:last});
 }
 return items;
}
export async function splitRangeVisualPageSet({source,sha256,pages}){
 if(!Array.isArray(pages)||pages.length<1||pages.length>4||
  new Set(pages).size!==pages.length)throw Error('INVALID_VISUAL_PAGE_SET');
 const result=[];
 for(const page of pages){
  const rendered=await renderWindow(source.reader,[page],{originalSha256:sha256});
  if(rendered.totalPages!==source.pageCount)
   throw Error('VISUAL_SOURCE_PAGE_COUNT_CHANGED');
  result.push({...rendered,startPage:page,endPage:page});
 }
 return result;
}
