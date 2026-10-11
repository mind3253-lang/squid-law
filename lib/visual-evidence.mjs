import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const integer=n=>Number.isSafeInteger(n)&&n>0;
const kinds=new Set(['text','scan','photo','table','stamp','signature','mixed','unknown']);
export function planVisualEvidence({documentId,pages,images=[],inventoryComplete=false}){
 if(typeof documentId!=='string'||!documentId||!Array.isArray(pages)||!Array.isArray(images))throw Error('INVALID_VISUAL_SOURCE');
 const map=new Map();
 for(const p of pages){if(!integer(p?.page)||map.has(p.page))throw Error('INVALID_VISUAL_PAGE');map.set(p.page,{documentId,page:p.page,textHash:sha(String(p.text??'')),textPresent:!!String(p.text??'').trim(),imageOperatorCount:Number.isSafeInteger(p.imageOperatorCount)&&p.imageOperatorCount>=0?p.imageOperatorCount:null,visualOperatorDigest:p.visualOperatorDigest||null,visualInventoryStatus:p.visualInventoryStatus||'unknown',images:[],visualStatus:'unreviewed'});}
 for(const item of images){
  if(!integer(item?.page)||!map.has(item.page)||!integer(item.index)||!kinds.has(item.kind||'unknown')||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256))throw Error('INVALID_VISUAL_OBJECT');
  const target=map.get(item.page);if(target.images.some(x=>x.index===item.index))throw Error('DUPLICATE_VISUAL_OBJECT');
  target.images.push({index:item.index,kind:item.kind||'unknown',sha256:item.sha256,sourcePath:item.sourcePath||null,status:'pending'});
 }
 return {documentId,pages:[...map.values()].sort((a,b)=>a.page-b.page).map(p=>({...p,requiresOCR:!p.textPresent,requiresVisualReview:p.images.length>0||!p.textPresent||p.imageOperatorCount===null||p.imageOperatorCount>0})),status:'pending',inventoryComplete:inventoryComplete===true,verified:false};
}
export function validateVisualResult(plan,result){
 if(!plan||!result||plan.documentId!==result.documentId||!Array.isArray(result.pages))return {complete:false,reason:'DOCUMENT_MISMATCH'};
 if(plan.inventoryComplete!==true)return {complete:false,reason:'VISUAL_INVENTORY_INCOMPLETE'};
 if(plan.verified===true&&plan.status==='pending')return {complete:false,reason:'INCONSISTENT_VISUAL_PLAN'};
 if(!Array.isArray(plan.pages)||!Array.isArray(result.pages))return {complete:false,reason:'INVALID_VISUAL_PAGES'};
 if(result.independentVisualVerified!==true)return {complete:false,reason:'INDEPENDENT_VISUAL_REVIEW_REQUIRED'};
 if(plan.pages.length===0)return {complete:false,reason:'EMPTY_VISUAL_PLAN'};
 const planIds=plan.pages.map(p=>p?.page);
 if(planIds.some(id=>!integer(id))||new Set(planIds).size!==planIds.length)return {complete:false,reason:'INVALID_VISUAL_PLAN_PAGES'};
 if(plan.pages.some(p=>p.documentId!==plan.documentId||!/^[a-f0-9]{64}$/.test(p.textHash||'')))return {complete:false,reason:'INVALID_VISUAL_SOURCE_PROVENANCE'};
 if(plan.pages.some(p=>p.visualOperatorDigest&&p.visualOperatorDigest!==sha(JSON.stringify([p.page,p.imageOperatorCount,p.visualInventoryStatus]))))return {complete:false,reason:'VISUAL_OPERATOR_DIGEST_MISMATCH'};
 if(result.pages.some(p=>!integer(p?.page)))return {complete:false,reason:'INVALID_VISUAL_RESULT_PAGE'};
 const actual=new Map(result.pages.map(p=>[p.page,p]));
 if(actual.size!==result.pages.length)return {complete:false,reason:'DUPLICATE_VISUAL_RESULT_PAGE'};
 if(actual.size!==plan.pages.length)return {complete:false,reason:'PAGE_COUNT_MISMATCH'};
 const sourcePages=new Set(plan.pages.map(p=>p.page));
 if(result.pages.some(p=>!sourcePages.has(p.page)))return {complete:false,reason:'UNEXPECTED_VISUAL_RESULT_PAGE'};
 const failures=[];
 for(const source of plan.pages){
  const p=actual.get(source.page);
  if(!p||p.textHash!==source.textHash){failures.push({page:source.page,reason:'SOURCE_HASH_MISMATCH'});continue}
  if(source.requiresOCR&&!(typeof p.ocrText==='string'&&p.ocrText.trim()&&p.ocrStatus==='verified'))failures.push({page:source.page,reason:'OCR_UNVERIFIED'});
  if(!Array.isArray(p.images)) {failures.push({page:source.page,reason:'INVALID_IMAGE_RESULTS'});continue}
  if(p.images.some(i=>!i||!integer(i.index))) {failures.push({page:source.page,reason:'INVALID_IMAGE_RESULT_INDEX'});continue}
  const found=new Map(p.images.map(i=>[i.index,i]));
  if(found.size!==p.images.length){failures.push({page:source.page,reason:'DUPLICATE_IMAGE_RESULT'});continue}
  if(!Array.isArray(source.images)){failures.push({page:source.page,reason:'INVALID_SOURCE_IMAGES'});continue}
  if(source.imageOperatorCount>0&&source.images.length===0){failures.push({page:source.page,reason:'UNINVENTORIED_PDF_IMAGES'});continue}
  if(found.size!==source.images.length){failures.push({page:source.page,reason:'IMAGE_COUNT_MISMATCH'});continue}
  if(source.images.some(i=>!i||!integer(i.index)||!/^[a-f0-9]{64}$/.test(i.sha256||''))){failures.push({page:source.page,reason:'INVALID_SOURCE_IMAGE'});continue}
  if(new Set(source.images.map(i=>i.index)).size!==source.images.length){failures.push({page:source.page,reason:'DUPLICATE_SOURCE_IMAGE'});continue}
  for(const image of source.images){const observed=found.get(image.index);if(!observed||observed.sha256!==image.sha256||observed.status!=='verified')failures.push({page:source.page,index:image.index,reason:'IMAGE_UNVERIFIED'});}
 }
 return {complete:failures.length===0,failures};
}
export function buildVisionRequest({documentId,page,imageSha256,mime,dataUrl,model,maxOutputTokens=1800}){
 if(!documentId||!integer(page)||!/^[0-9a-f]{64}$/.test(imageSha256||'')||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl||'')||!model)throw Error('INVALID_VISION_REQUEST');
 return {model,input:[{role:'user',content:[{type:'input_text',text:'Read visible Korean text exactly. Identify document evidence, tables, signatures, stamps and photos. Distinguish observed content from interpretation. Return a JSON object with observedText, visualFacts, uncertainties. Do not infer missing content.'},{type:'input_image',image_url:dataUrl}]}],max_output_tokens:maxOutputTokens,metadata:{sourceDocument:documentId.slice(0,60),sourcePage:String(page),sourceImageHash:imageSha256.slice(0,32)}};
}
export function estimateVisionBudget({imageCount,estimatedInputTokensPerImage,estimatedOutputTokensPerImage,inputUsdPerMillion,outputUsdPerMillion}){
 const values=[imageCount,estimatedInputTokensPerImage,estimatedOutputTokensPerImage,inputUsdPerMillion,outputUsdPerMillion];
 if(values.some(x=>!Number.isFinite(x)||x<0))throw Error('INVALID_COST_ESTIMATE');
 return {estimatedUsd:(imageCount*estimatedInputTokensPerImage*inputUsdPerMillion+imageCount*estimatedOutputTokensPerImage*outputUsdPerMillion)/1e6,estimatedImages:imageCount,estimatedOnly:true};
}

export function buildVisualWorkQueue({documentId,pages,sourcePdfPath}){
 if(!documentId||!Array.isArray(pages)||!sourcePdfPath)throw Error('INVALID_VISUAL_QUEUE_INPUT');
 const plan=planVisualEvidence({documentId,pages});
 const tasks=plan.pages.filter(p=>p.requiresVisualReview).map(p=>({documentId,page:p.page,sourcePdfPath,textHash:p.textHash,imageOperatorCount:p.imageOperatorCount,needsOCR:p.requiresOCR,needsImageInventory:p.imageOperatorCount===null||p.imageOperatorCount>0,status:'awaiting_visual_provider',verified:false}));
 return {documentId,sourcePdfPath,tasks,taskCount:tasks.length,verified:false,requiresIndependentAudit:true};
}
