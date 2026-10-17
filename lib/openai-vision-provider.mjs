import {summarizeModelUsage} from './model-usage-observability.mjs';
import {createHash} from 'node:crypto';
import {buildVisionRequest} from './visual-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function analyzeEvidenceImage({documentId,page,imageBytes,mime='image/png',apiKey,model='gpt-4.1-mini',fetchImpl=fetch}){
 if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('UNSUPPORTED_EVIDENCE_IMAGE');
 const bytes=Buffer.from(imageBytes||[]);
 if(!bytes.length||bytes.length>20*1024*1024)throw Error('INVALID_EVIDENCE_IMAGE_SIZE');
 const request=buildVisionRequest({documentId,page,imageSha256:sha(bytes),mime,dataUrl:'data:'+mime+';base64,'+bytes.toString('base64'),model});
 const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(90000)});
 const payload=await response.json().catch(()=>null);
 if(!response.ok)throw Error('VISION_API_'+response.status+':'+String(payload?.error?.code||payload?.error?.message||'UNKNOWN').slice(0,120));
 const text=(payload?.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n');
 if(!text.trim())throw Error('VISION_EMPTY_OUTPUT');
 let observations;try{observations=JSON.parse(text.replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,''))}catch{throw Error('VISION_INVALID_JSON')}
 if(!observations||typeof observations.observedText!=='string'||!Array.isArray(observations.visualFacts)||!Array.isArray(observations.uncertainties))throw Error('VISION_INVALID_SCHEMA');
 return {documentId,page,sourceImageSha256:sha(bytes),model,observations,usage:payload.usage||null,modelUsage:summarizeModelUsage(payload,{model,stage:'vision_image'}),providerResponseId:payload.id||null,independentlyVerified:false};
}

export async function analyzePdfVisualEvidence({documentId,pdfBytes,apiKey,model='gpt-4.1-mini',fetchImpl=fetch,auditOf=null,pageOffset=0,originalPdfSha256=null}){
 if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
 const bytes=Buffer.from(pdfBytes||[]);
 if(!bytes.length||bytes.length>50*1024*1024)throw Error('PDF_VISION_FILE_SIZE_UNSUPPORTED');
 const sourcePdfSha256=originalPdfSha256||sha(bytes);
 if(!Number.isSafeInteger(pageOffset)||pageOffset<0)throw Error('VISION_PAGE_OFFSET_INVALID');
 if(auditOf&&(auditOf.documentId!==documentId||auditOf.sourcePdfSha256!==sourcePdfSha256))throw Error('VISION_AUDIT_SOURCE_MISMATCH');
 const upload=new FormData();
 upload.append('purpose','user_data');
 upload.append('file',new Blob([bytes],{type:'application/pdf'}),String(documentId).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80)+'.pdf');
 const uploaded=await fetchImpl('https://api.openai.com/v1/files',{method:'POST',headers:{Authorization:'Bearer '+apiKey},body:upload,signal:AbortSignal.timeout(90000)});
 const file=await uploaded.json().catch(()=>null);
 if(!uploaded.ok||!file?.id)throw Error('VISION_PDF_UPLOAD_'+uploaded.status);
 try{
  const request={model,store:false,input:[{role:'user',content:[
   {type:'input_text',text:auditOf?'Independently inspect this PDF WINDOW without trusting earlier observations. Report page numbers relative to this attached window, starting at 1, never the original document page numbers. Earlier observations (with absolute original page numbers) are untrusted and provided only for comparison: '+JSON.stringify(auditOf.observations).slice(0,16000)+'. Return JSON with pageObservations [{page,visualFacts,observedText,uncertainties}] and unreviewedPages. List any page you cannot inspect as unreviewed.':'Review EVERY page in the attached PDF window, including text-only pages. For each page inspected, include exactly one pageObservations item numbered from 1 within this PDF window. Record photographs, scanned text, stamps, signatures, charts and tables when present. Return a concise JSON object with pageObservations array of {page,visualFacts,observedText,uncertainties} and unreviewedPages array. Do not claim a page was reviewed unless actually inspected. Do not invent evidence. Return only valid JSON with pageObservations and unreviewedPages; page numbers must match the attached PDF window (starting at 1).'},
   {type:'input_file',file_id:file.id}
  ]}],max_output_tokens:6000};
  const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(90000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error('VISION_PDF_API_'+response.status+':'+String(result?.error?.code||'UNKNOWN'));
  const output=(result?.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n');
  if(!output.trim())throw Error('VISION_PDF_EMPTY_OUTPUT');
  let parsed;try{parsed=JSON.parse(output.replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,''))}catch{throw Error('VISION_PDF_INVALID_JSON')}
  if(!parsed||!Array.isArray(parsed.pageObservations)||!Array.isArray(parsed.unreviewedPages))throw Error('VISION_PDF_INVALID_SCHEMA');
  if(result.status!=='completed')throw Error('VISION_PDF_INCOMPLETE');
  for(const p of parsed.pageObservations)if(!Number.isSafeInteger(p?.page)||p.page<1||!Array.isArray(p.visualFacts)||typeof p.observedText!=='string'||!Array.isArray(p.uncertainties))throw Error('VISION_PDF_INVALID_PAGE');
  if(parsed.unreviewedPages.some(p=>!Number.isSafeInteger(p)||p<1))throw Error('VISION_PDF_INVALID_UNREVIEWED_PAGE');
  if(new Set(parsed.pageObservations.map(p=>p.page)).size!==parsed.pageObservations.length)throw Error('VISION_PDF_DUPLICATE_PAGE');
  parsed.pageObservations=parsed.pageObservations.map(p=>({...p,page:p.page+pageOffset}));
  parsed.unreviewedPages=parsed.unreviewedPages.map(p=>p+pageOffset);
  return {documentId,sourcePdfSha256,providerResponseId:result.id||null,observations:parsed,usage:result.usage||null,modelUsage:summarizeModelUsage(result,{model,stage:auditOf?'vision_pdf_independent':'vision_pdf_primary'}),independentlyVerified:false,auditPass:Boolean(auditOf)};
 }finally{
  await fetchImpl('https://api.openai.com/v1/files/'+encodeURIComponent(file.id),{method:'DELETE',headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)}).catch(()=>{});
 }
}
