// Disabled-by-default private AI comparison adapter. Never expose without auth/billing.
// Uses the same server-side credentials as the batch analyzer.
import {createComparisonModelRequest} from './analysis-comparison-prompt.js';
import {validateComparisonResponse} from './analysis-comparison-response.js';

export async function analyzeComparisonWithModel(documents,lead,{
 enabled=false,apiKey,model,fetchImpl=globalThis.fetch,timeoutMs=30000
}={}){
 if(!enabled)throw Error('AI_COMPARISON_DISABLED');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('MISSING_SERVER_API_KEY');
 if(typeof model!=='string'||!/^gpt-[a-zA-Z0-9.-]+$/.test(model))throw Error('INVALID_MODEL');
 if(typeof fetchImpl!=='function')throw Error('INVALID_FETCH');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('INVALID_TIMEOUT');
 const prompt=createComparisonModelRequest(lead);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  let response;
  try{response=await fetchImpl('https://api.openai.com/v1/responses',{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},
   body:JSON.stringify({
    model,instructions:prompt.system,input:prompt.user,
    text:{format:{type:'json_schema',name:'squidlaw_comparison',strict:true,schema:{
     type:'object',additionalProperties:false,
     required:['relation','explanation','citations'],
     properties:{
      relation:{type:'string',enum:['conflict_candidate','different_positions','insufficient_information']},
      explanation:{type:'string'},
      citations:{type:'array',items:{type:'object',additionalProperties:false,
       required:['document','page','quote'],
       properties:{document:{type:'string'},page:{type:'integer'},quote:{type:'string'}}
      }}
     }
    }}},
    max_output_tokens:1200,store:false
   }),
   signal:controller.signal
  });}catch(error){if(controller.signal.aborted)throw Error('MODEL_REQUEST_TIMEOUT');throw error;}
  if(!response?.ok)throw Error('COMPARISON_MODEL_REQUEST_FAILED');
  if(typeof response.json!=='function')throw Error('COMPARISON_MODEL_RESPONSE_INVALID');
  let data;
  try{data=await response.json();}catch{throw Error('COMPARISON_MODEL_RESPONSE_INVALID');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('COMPARISON_MODEL_RESPONSE_INVALID');
  if(data.status==='incomplete'||data.incomplete_details)throw Error('COMPARISON_MODEL_INCOMPLETE');
  if(typeof data.status!=='string')throw Error('COMPARISON_MODEL_NOT_COMPLETED');
  if(data.status&&data.status!=='completed')throw Error('COMPARISON_MODEL_NOT_COMPLETED');
  if(data.error)throw Error('COMPARISON_MODEL_ERROR');
  if(!Array.isArray(data.output)||data.output.length===0)throw Error('COMPARISON_MODEL_OUTPUT_INVALID');
  const output=data.output;
  if(output.some(item=>item?.type==='refusal'||(Array.isArray(item?.content)&&item.content.some(c=>c?.type==='refusal'))))throw Error('COMPARISON_MODEL_REFUSED');
  const raw=output.flatMap(item=>Array.isArray(item?.content)?item.content:[])
   .filter(item=>item?.type==='output_text'&&typeof item.text==='string')
   .map(item=>item.text).join('');
  if(!raw||raw.length>12000)throw Error('COMPARISON_MODEL_OUTPUT_INVALID');
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw Error('COMPARISON_MODEL_NOT_JSON');}
  return validateComparisonResponse(documents,lead,parsed);
 }catch(error){
  // Abort may occur while reading response.json(), after fetch has resolved.
  if(controller.signal.aborted)throw Error('MODEL_REQUEST_TIMEOUT');
  throw error;
 }finally{clearTimeout(timer);}
}
