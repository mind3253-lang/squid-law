// Gabia-only adapter for the EXISTING SQUIDLAW PDF vision and OCR engines.
// Paid model calls are only reachable through the explicit legal-run opt-in.
import {readFile,writeFile,link,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {inspectPdfPageCount} from '../api/customer-pdf-extract.js';
import {splitPdfVisualWindow} from '../lib/pdf-visual-windows.mjs';
import {analyzePdfVisualEvidence} from '../lib/openai-vision-provider.mjs';
import {compareIndependentVisualPass} from '../lib/visual-review-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
async function immutable(path,data){
 const temp=path+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify(data),{flag:'wx',mode:0o600});
 try{await link(temp,path)}catch(e){if(e.code!=='EEXIST')throw e;const prior=JSON.parse(await readFile(path,'utf8'));if(prior.sourcePdfSha256!==data.sourcePdfSha256||prior.documentId!==data.documentId)throw Error('VISUAL_CHECKPOINT_SOURCE_CONFLICT')}finally{await unlink(temp)}
}
async function existing(path,expected){
 try{
  const value=JSON.parse(await readFile(path,'utf8'));
  if(value.documentId!==expected.documentId||value.sourcePdfSha256!==expected.sourcePdfSha256||value.startPage!==expected.startPage||value.endPage!==expected.endPage)throw Error('VISUAL_CHECKPOINT_SOURCE_CONFLICT');
  return value;
 }catch(e){if(e.code==='ENOENT')return null;throw e}
}
export async function runGabiaVisualReview({bytes,documentId,base,apiKey,checkLease,checkpoint}){
 if(process.env.SQUIDLAW_GABIA_LEGAL_RUN_APPROVED!=='YES'||!apiKey)throw Error('VISION_RUN_NOT_APPROVED');
 const pageCount=await inspectPdfPageCount(bytes),sourcePdfSha256=sha(bytes),recoveredText=new Map();
 let verified=true;
 for(let startPage=1;startPage<=pageCount;startPage+=12){
  await checkLease();
  const window=await splitPdfVisualWindow({pdfBytes:bytes,startPage,pageCount:12});
  const identity={documentId,sourcePdfSha256,startPage:window.startPage,endPage:window.endPage};
  const pages=window.endPage-window.startPage+1;
  const firstPath=base+'.visual-'+String(startPage).padStart(6,'0')+'-primary.json';
  const secondPath=base+'.visual-'+String(startPage).padStart(6,'0')+'-independent.json';
  let primary=await existing(firstPath,identity);
  if(!primary){
   const response=await analyzePdfVisualEvidence({documentId,pdfBytes:window.bytes,apiKey,pageOffset:startPage-1,windowPageCount:pages,originalPdfSha256:sourcePdfSha256});
   primary={...response,...identity};
   await immutable(firstPath,primary);
   await checkpoint({stage:'visual_primary_running',page:startPage});
  }
  await checkLease();
  let independent=await existing(secondPath,identity);
  if(!independent){
   const response=await analyzePdfVisualEvidence({documentId,pdfBytes:window.bytes,apiKey,pageOffset:startPage-1,windowPageCount:pages,originalPdfSha256:sourcePdfSha256,auditOf:primary});
   independent={...response,...identity};
   await immutable(secondPath,independent);
   await checkpoint({stage:'visual_independent_running',page:startPage});
  }
  // Independent comparison is evidence of review, not permission to bypass OCR/visual gates.
  const a=new Map(primary.observations.pageObservations.map(x=>[x.page,x]));
  const b=new Map(independent.observations.pageObservations.map(x=>[x.page,x]));
  for(let page=startPage;page<=window.endPage;page++){
   const left=a.get(page),right=b.get(page);
   if(!left||!right||left.uncertainties?.length||right.uncertainties?.length){verified=false;continue}
   const text=String(left.observedText||'').trim();
   if(text&&text===String(right.observedText||'').trim())recoveredText.set(page,text);
   else if(text!==String(right.observedText||'').trim())verified=false;
  }
  if(primary.observations.unreviewedPages.length||independent.observations.unreviewedPages.length)verified=false;
 }
 return {pageCount,sourcePdfSha256,recoveredText,verified};
}
