// Private worker adapter. Never import into browser code or public routes.
// Caller must enforce authentication, payment, rate limits and privacy policy first.
import {createBatchModelRequest} from './analysis-model-prompt.js';
import {parseModelFindings} from './analysis-model-response.js';

export async function analyzeBatchWithModel(batch,{
 apiKey,model,fetchImpl=globalThis.fetch,enabled=false,timeoutMs=45000
}={}){
 if(!enabled)throw Error('AI_WORKER_DISABLED');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('MISSING_SERVER_API_KEY');
 if(typeof model!=='string'||!/^gpt-[a-zA-Z0-9.-]+$/.test(model))throw Error('INVALID_MODEL');
 if(typeof fetchImpl!=='function')throw Error('INVALID_FETCH');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('INVALID_TIMEOUT');
 const prompt=createBatchModelRequest(batch);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl('https://api.openai.com/v1/responses',{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},
   body:JSON.stringify({
    model,
    instructions:prompt.system,
    input:prompt.user,
    text:{format:{
     type:'json_schema',
     name:'squidlaw_findings',
     strict:true,
     schema:{
      type:'object',
      additionalProperties:false,
      required:['schema','findings'],
      properties:{
       schema:{type:'string',enum:['squidlaw-findings-v1']},
       findings:{type:'array',items:{
        type:'object',additionalProperties:false,required:['title','analysis','claim','evidence','rebuttal','proofGap','citations'],
        properties:{
         title:{type:'string'},
         analysis:{type:'string'},
         claim:{type:'string'},
         evidence:{type:'string'},
         rebuttal:{type:'string'},
         proofGap:{type:'string'},
         citations:{type:'array',items:{
          type:'object',additionalProperties:false,
          required:['document','page','quote'],
          properties:{document:{type:'string'},page:{type:'integer'},quote:{type:'string'}}
         }}
        }
       }}
      }
     }
    }},
    max_output_tokens:9000,
    store:false
   }),
   signal:controller.signal
  });
  if(!response||!response.ok)throw Error('MODEL_REQUEST_FAILED');
  if(typeof response.json!=='function')throw Error('INVALID_MODEL_RESPONSE');
  let data;
  try{data=await response.json();}catch{throw Error('INVALID_MODEL_RESPONSE');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_MODEL_RESPONSE');
  if(data.status==='incomplete')throw Error('MODEL_RESPONSE_INCOMPLETE');
  if(typeof data.status!=='string')throw Error('MODEL_RESPONSE_NOT_COMPLETED');
  if(data.incomplete_details)throw Error('MODEL_RESPONSE_INCOMPLETE');
  if(data.status&&data.status!=='completed')throw Error('MODEL_RESPONSE_NOT_COMPLETED');
  if(data.error)throw Error('MODEL_RESPONSE_ERROR');
  if(data.output&& !Array.isArray(data.output))throw Error('INVALID_MODEL_OUTPUT');
  if((Array.isArray(data.output)?data.output:[]).some(item=>item.type==='refusal'||(Array.isArray(item.content)&&item.content.some(part=>part.type==='refusal'))))throw Error('MODEL_REFUSED');
  const raw=(Array.isArray(data.output)?data.output:[])
   .flatMap(item=>Array.isArray(item.content)?item.content:[])
   .filter(item=>item.type==='output_text'&&typeof item.text==='string')
   .map(item=>item.text).join('');
  return parseModelFindings(raw);
 }finally{clearTimeout(timer);}
}
