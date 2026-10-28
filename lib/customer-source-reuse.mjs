import {createHash} from 'node:crypto';
import {auditBoundaryReview} from './independent-boundary-review.mjs';

// Immutable, customer/case-scoped receipts; never share evidence between customers.
const SHA=/^[0-9a-f]{64}$/;
const ident=/^[A-Za-z0-9_-]{1,100}$/;
const modelId=/^[A-Za-z0-9_.-]{1,60}$/;
const zeroUsage=(model,stage)=>({model,stage,inputTokens:0,outputTokens:0,totalTokens:0});
function checked({prefix,doc,model}){
 if(!prefix?.startsWith('squidlaw/cases/')||!prefix.endsWith('/')||!ident.test(doc?.id||'')||
  !SHA.test(doc?.sha256||'')||!Number.isSafeInteger(doc?.pageCount)||doc.pageCount<1||
  !modelId.test(model||''))throw Error('SOURCE_REUSE_IDENTITY_INVALID');
}
export function sourceVisionWindowCachePath({prefix,doc,startPage,model}){
 checked({prefix,doc,model});
 if(!Number.isSafeInteger(startPage)||startPage<1||startPage>doc.pageCount||(startPage-1)%10!==0)
  throw Error('SOURCE_VISION_PAGE_INVALID');
 return prefix+'source-vision-cache/'+doc.id+'/'+doc.sha256+'/'+model+'/window-'+String(startPage).padStart(8,'0')+'-v1.json';
}
export function sourceBoundaryCachePath({prefix,doc,model}){
 checked({prefix,doc,model});
 return prefix+'source-boundary-cache/'+doc.id+'/'+doc.sha256+'/'+model+'-v1.json';
}
export function visionSourceReceipt({doc,startPage,model,output}){
 if(!doc||!output)return null;
 const pageCount=Math.min(10,doc.pageCount-startPage+1);
 if(!Number.isSafeInteger(startPage)||startPage<1||(startPage-1)%10!==0||
  output.documentId!==doc.id||output.sourcePdfSha256!==doc.sha256||
  !Array.isArray(output.observations?.pageObservations)||
  output.observations.pageObservations.length!==pageCount||
  !Array.isArray(output.observations?.unreviewedPages)||
  output.observations.unreviewedPages.length>0)return null;
 const pages=output.observations.pageObservations;
 if(pages.some((p,i)=>p?.page!==startPage+i||!Array.isArray(p.visualFacts)||
  typeof p.observedText!=='string'||!Array.isArray(p.uncertainties)))return null;
 const sourceOutput={documentId:output.documentId,sourcePdfSha256:output.sourcePdfSha256,
  startPage,endPage:startPage+pageCount-1,
  observations:output.observations,providerResponseId:output.providerResponseId||null};
 const data={schema:1,verified:true,documentId:doc.id,sourcePdfSha256:doc.sha256,
  pageCount:doc.pageCount,startPage,model,output:sourceOutput};
 data.receiptSha256=createHash('sha256').update(JSON.stringify(sourceOutput)).digest('hex');
 return data;
}
export function reuseVisionReceipt({cache,doc,startPage,model}){
 if(cache?.schema!==1||cache.verified!==true||cache.documentId!==doc?.id||
  cache.sourcePdfSha256!==doc.sha256||cache.pageCount!==doc.pageCount||
  cache.startPage!==startPage||cache.model!==model||!SHA.test(cache.receiptSha256||''))return null;
 const rebuilt=visionSourceReceipt({doc,startPage,model,output:cache.output});
 if(!rebuilt||rebuilt.receiptSha256!==cache.receiptSha256)return null;
 return {...rebuilt.output,providerResponseId:null,sourceProviderResponseId:rebuilt.output.providerResponseId,
  modelUsage:zeroUsage(model,'vision_source_reuse'),reusedFromVerifiedSource:true,
  independentlyVerified:false};
}
export function boundarySourceReceipt({doc,model,result}){
 if(!Array.isArray(result?.sections)||!Array.isArray(result?.unreviewedPages))return null;
 const audit=auditBoundaryReview({result,documentId:doc?.id,
  sourcePdfSha256:doc?.sha256,pageCount:doc?.pageCount});
 if(!audit.complete)return null;
 const validated={documentId:doc.id,sourcePdfSha256:doc.sha256,
  sections:result.sections,unreviewedPages:[],providerResponseId:result.providerResponseId||null};
 const receipt={schema:1,verified:true,documentId:doc.id,sourcePdfSha256:doc.sha256,
  pageCount:doc.pageCount,model,result:validated};
 receipt.receiptSha256=createHash('sha256').update(JSON.stringify(validated)).digest('hex');
 return receipt;
}
export function reuseBoundaryReceipt({cache,doc,model}){
 if(cache?.schema!==1||cache.verified!==true||cache.documentId!==doc?.id||
  cache.sourcePdfSha256!==doc.sha256||cache.pageCount!==doc.pageCount||
  cache.model!==model||!SHA.test(cache.receiptSha256||''))return null;
 const rebuilt=boundarySourceReceipt({doc,model,result:cache.result});
 if(!rebuilt||rebuilt.receiptSha256!==cache.receiptSha256)return null;
 return {...rebuilt.result,providerResponseId:null,
  sourceProviderResponseId:rebuilt.result.providerResponseId,
  modelUsage:zeroUsage(model,'boundary_source_reuse'),reusedFromVerifiedSource:true};
}
