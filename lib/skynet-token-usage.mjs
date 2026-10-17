import {quoteCustomerUsage,settleCustomerUsage} from './customer-usage-settlement.mjs';
import {summarizeModelUsage} from './model-usage-observability.mjs';
export function tokenUsage(model,usage){const input=Number(usage?.prompt_tokens),output=Number(usage?.completion_tokens);if(!model||!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)throw Error('INVALID_USAGE');return {model,input,output,total:input+output,recordedAt:new Date().toISOString()}}

/** Preliminary upper-side estimate, not a provider token count or monetary quote. */
export function estimateSkynetRequestUnits({messages,contextCharacters=0,maxOutputTokens=5000}){
 const chars=(Array.isArray(messages)?messages:[]).reduce((n,m)=>n+String(m?.content||'').length,0);
 if(!Number.isSafeInteger(contextCharacters)||contextCharacters<0||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<0)throw Error('INVALID_SKYNET_ESTIMATE');
 // Korean/mixed source text can tokenize more densely than English.
 return Math.ceil((chars+contextCharacters)*1.5)+maxOutputTokens;
}

export function skynetUsageAccounting({model,usage,estimatedUnits,lossReserveUnits=0,sourceVersion='skynet-chat'}){
 const quote=quoteCustomerUsage({estimatedUnits,lossReserveUnits,sourceVersion});
 const measured=usage?summarizeModelUsage({status:'completed',usage:{
  input_tokens:usage.prompt_tokens,output_tokens:usage.completion_tokens,total_tokens:usage.total_tokens
 }},{model,stage:'skynet_chat'}):null;
 const complete=measured!=null&&measured.totalTokens!==null&&measured.inputTokens!==null&&measured.outputTokens!==null;
 const settlement=settleCustomerUsage({quote,measuredUnits:complete?measured.totalTokens:0,
  unmeasuredEstimatedUnits:complete?0:quote.minimumBillableUnits,measurementComplete:complete});
 return {service:'skynet',model,quote,measuredUsage:measured,settlement,
  chargeAmount:null,pricingStatus:'unconfigured'};
}
