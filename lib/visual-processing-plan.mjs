import {createHash} from 'node:crypto';
import {buildVisionRequest} from './visual-evidence.mjs';
import {authorizeProviderCall} from './provider-gate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function prepareVisionBatch({documentId,renderedPages,gate,estimatedUsdPerPage=0,model}){
 if(!documentId||!Array.isArray(renderedPages)||!renderedPages.length||!Number.isFinite(estimatedUsdPerPage)||estimatedUsdPerPage<0)throw Error('INVALID_VISION_BATCH');
 const prepared=[];
 const totalEstimate=renderedPages.length*estimatedUsdPerPage;
 const budgetFits=Number.isFinite(totalEstimate)&&gate?.spentUsd+totalEstimate<=gate?.maxUsd;
 for(const page of renderedPages){
  if(!Number.isSafeInteger(page.page)||page.page<1||page.mime!=='image/png'||!Buffer.isBuffer(page.bytes))throw Error('INVALID_RENDERED_IMAGE');
  const hash=sha(page.bytes),sourceId=documentId+':'+page.page+':'+hash;
  const permission=budgetFits?authorizeProviderCall(gate,{estimatedUsd:estimatedUsdPerPage,sourceId,contentHash:hash}):{allowed:false,reason:'BATCH_BUDGET_EXCEEDED'};
  const request=buildVisionRequest({documentId,page:page.page,imageSha256:hash,mime:'image/png',dataUrl:'data:image/png;base64,'+page.bytes.toString('base64'),model:model||gate?.model});
  prepared.push({documentId,page:page.page,imageSha256:hash,permission,request,verified:false});
 }
 return {documentId,pages:prepared,authorized:prepared.every(p=>p.permission.allowed),estimatedTotalUsd:totalEstimate,executed:false};
}
