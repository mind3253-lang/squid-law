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
 return {documentId,page,sourceImageSha256:sha(bytes),model,observations,usage:payload.usage||null,providerResponseId:payload.id||null,independentlyVerified:false};
}
