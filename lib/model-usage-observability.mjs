/** Safe aggregate of model usage. No prompts, evidence text or customer identifiers. */
const integer=x=>Number.isSafeInteger(x)&&x>=0?x:null;
export function summarizeModelUsage(payload,{model='unknown',stage='unknown',failureCode=null}={}){
 const u=payload?.usage||{};
 const inputTokens=integer(u.input_tokens),outputTokens=integer(u.output_tokens);
 const totalTokens=integer(u.total_tokens)??(inputTokens!==null&&outputTokens!==null?inputTokens+outputTokens:null);
 return {model:String(model).slice(0,80),stage:String(stage).slice(0,80),
  inputTokens,outputTokens,totalTokens,
  costUsd:null,costStatus:'pricing_not_configured',
  outcome:failureCode?'failed':payload?.status==='completed'?'completed':'incomplete',
  failureCode:failureCode?String(failureCode).replace(/[^A-Z0-9_]/gi,'_').slice(0,80):null};
}

/** Count actual provider usage only; never estimate missing tokens as zero. */
export function aggregateModelUsage(records){
 const valid=(Array.isArray(records)?records:[]).filter(r=>r&&typeof r.model==='string');
 const models=new Map();
 for(const r of valid){
  const key=r.model+'|'+r.stage;
  const current=models.get(key)||{model:r.model,stage:r.stage,apiCalls:0,inputTokens:0,outputTokens:0,totalTokens:0,unmeteredCalls:0};
  current.apiCalls++;
  if([r.inputTokens,r.outputTokens,r.totalTokens].every(n=>Number.isSafeInteger(n)&&n>=0)){
   current.inputTokens+=r.inputTokens;current.outputTokens+=r.outputTokens;current.totalTokens+=r.totalTokens;
  }else current.unmeteredCalls++;
  models.set(key,current);
 }
 const byModel=[...models.values()];
 return {apiCalls:valid.length,byModel,unmeteredCalls:byModel.reduce((n,x)=>n+x.unmeteredCalls,0),costUsd:null,costStatus:'pricing_not_configured'};
}
