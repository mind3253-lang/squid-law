// Shared Responses API JSON transport. Semantic and source validation stay separate.
export async function invokeJsonResponse({request,apiKey,fetchImpl=fetch,timeoutMs=110000,errorPrefix='MODEL',usageMapper}){
 if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
 const response=await fetchImpl('https://api.openai.com/v1/responses',{
  method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify(request),signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok){
  let detail='',code='';
  try{const body=await response.json();detail=String(body?.error?.message||'').replace(/[\r\n]+/g,' ').slice(0,240);
   code=String(body?.error?.code||body?.error?.type||'').slice(0,80)}catch{}
  const error=new Error(errorPrefix+'_HTTP_'+response.status);
  error.status=response.status;error.providerErrorCode=code;error.providerErrorSummary=detail;throw error;
 }
 const data=await response.json();
 if(data.status!=='completed'){
  const reason=String(data.incomplete_details?.reason||data.error?.code||data.status||'unknown').slice(0,100);
  const error=new Error(errorPrefix+'_INCOMPLETE:'+reason);
  error.providerStatus=data.status;error.providerIncompleteReason=reason;
  error.providerOutputTokens=data.usage?.output_tokens??null;throw error;
 }
 const raw=(data.output||[]).flatMap(x=>x.type==='message'?(x.content||[]):[])
  .filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let result;try{result=JSON.parse(raw)}catch{throw Error(errorPrefix+'_INVALID_JSON')}
 if(!result||typeof result!=='object'||Array.isArray(result))throw Error(errorPrefix+'_INVALID_JSON');
 return {result,responseId:data.id||null,
  ...(usageMapper?{modelUsage:usageMapper(data)}:{usage:data.usage||null})};
}
