import {createHash} from 'node:crypto';
import {aggregateModelUsage} from './model-usage-observability.mjs';
/** Rebuild from immutable checkpoint outputs; path identity prevents double counting on retry. */
export async function buildCustomerUsageLedger({paths,load,sourceVersion}){
 if(typeof load!=='function'||typeof sourceVersion!=='string'||!sourceVersion)throw Error('INVALID_USAGE_LEDGER');
 const unique=[...new Set((paths||[]).filter(p=>typeof p==='string'&&p.length))].sort();
 const records=[],missing=[];
 // Bounded concurrent reads preserve ordering while avoiding one network RTT per checkpoint.
 for(let start=0;start<unique.length;start+=12){
  const paths=unique.slice(start,start+12);
  const artifacts=await Promise.all(paths.map(path=>load(path)));
  for(let i=0;i<paths.length;i++){
   const path=paths[i],artifact=artifacts[i];
   if(!artifact){missing.push({checkpoint:path,reason:'missing_checkpoint'});continue}
   const usage=artifact.modelUsage||artifact.result?.modelUsage||null;
   if(!usage||!Number.isSafeInteger(usage.totalTokens)||usage.totalTokens<0){
    missing.push({checkpoint:path,reason:'missing_provider_usage'});continue;
   }
   records.push({checkpoint:path,model:usage.model,stage:usage.stage,
    inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,totalTokens:usage.totalTokens,
    providerResponseId:artifact.providerResponseId||artifact.responseId||null});
  }
 }
 const aggregate=aggregateModelUsage(records);
 return {schema:'customer_usage_ledger_v1',sourceVersion,checkpoints:unique.length,
  records,missing,aggregate,complete:missing.length===0,
  ledgerDigest:createHash('sha256').update(JSON.stringify({sourceVersion,records,missing})).digest('hex'),
  pricingStatus:'unconfigured'};
}
