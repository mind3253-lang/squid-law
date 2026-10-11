import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
export function createProviderGate({enabled=false,approved=false,maxUsd=0,spentUsd=0,model='',allowExternalTransfer=false}={}){
 if(!Number.isFinite(maxUsd)||maxUsd<0||!Number.isFinite(spentUsd)||spentUsd<0)throw Error('INVALID_BUDGET');
 return {enabled:enabled===true,approved:approved===true,maxUsd,spentUsd,model,allowExternalTransfer:allowExternalTransfer===true};
}
export function authorizeProviderCall(gate,{estimatedUsd,sourceId,contentHash}){
 if(!gate?.enabled)return {allowed:false,reason:'PROVIDER_DISABLED'};
 if(!gate.approved||!gate.allowExternalTransfer)return {allowed:false,reason:'CONSENT_REQUIRED'};
 if(!gate.model)return {allowed:false,reason:'MODEL_NOT_CONFIGURED'};
 if(!Number.isFinite(estimatedUsd)||estimatedUsd<0)return {allowed:false,reason:'INVALID_ESTIMATE'};
 if(gate.spentUsd+estimatedUsd>gate.maxUsd)return {allowed:false,reason:'BUDGET_EXCEEDED'};
 if(!sourceId||!/^[0-9a-f]{64}$/.test(contentHash||''))return {allowed:false,reason:'SOURCE_INTEGRITY_REQUIRED'};
 return {allowed:true,requestKey:digest([gate.model,sourceId,contentHash].join(':')),reservedUsd:estimatedUsd};
}
export function mockProviderResponse(request,{observedText='',visualFacts=[],uncertainties=[]}={}){
 if(!request?.model||!Array.isArray(request.input))throw Error('INVALID_PROVIDER_REQUEST');
 return {mock:true,provider:'mock',model:request.model,output:{observedText,visualFacts,uncertainties},usage:{inputTokens:0,outputTokens:0,costUsd:0},verified:false};
}
