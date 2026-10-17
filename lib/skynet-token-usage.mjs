export function tokenUsage(model,usage){const input=Number(usage?.prompt_tokens),output=Number(usage?.completion_tokens);if(!model||!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)throw Error('INVALID_USAGE');return {model,input,output,total:input+output,recordedAt:new Date().toISOString()}}

/** Preliminary upper-side estimate, not a provider token count or monetary quote. */
export function estimateSkynetRequestUnits({messages,contextCharacters=0,maxOutputTokens=5000}){
 const chars=(Array.isArray(messages)?messages:[]).reduce((n,m)=>n+String(m?.content||'').length,0);
 if(!Number.isSafeInteger(contextCharacters)||contextCharacters<0||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<0)throw Error('INVALID_SKYNET_ESTIMATE');
 // Korean/mixed source text can tokenize more densely than English.
 return Math.ceil((chars+contextCharacters)*1.5)+maxOutputTokens;
}
