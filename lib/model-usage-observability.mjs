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
