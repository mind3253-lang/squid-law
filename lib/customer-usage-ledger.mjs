import {createHash} from 'node:crypto';
import {aggregateModelUsage} from './model-usage-observability.mjs';
/** Rebuild from immutable checkpoint outputs; path identity prevents double counting on retry. */
export async function buildCustomerUsageLedger({paths,load,sourceVersion}){
 if(typeof load!=='function'||typeof sourceVersion!=='string'||!sourceVersion)throw Error('INVALID_USAGE_LEDGER');
 const unique=[...new Set((paths||[]).filter(p=>typeof p==='string'&&p.length))].sort();
 const records=[],missing=[];
 for(const path of unique){
  const artifact=await load(path);
  if(!artifact){missing.push({checkpoint:path,reason:'missing_checkpoint'});continue}
  const usage=artifact.modelUsage||artifact.result?.modelUsage||null;
  if(!usage||!Number.isSafeInteger(usage.totalTokens)||usage.totalTokens<0){
   missing.push({checkpoint:path,reason:'missing_provider_usage'});continue;
  }
  records.push({checkpoint:path,model:usage.model,stage:usage.stage,
   inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,totalTokens:usage.totalTokens,
   providerResponseId:artifact.providerResponseId||artifact.responseId||null});
 }
 const aggregate=aggregateModelUsage(records);
 return {schema:'customer_usage_ledger_v1',sourceVersion,checkpoints:unique.length,
  records,missing,aggregate,complete:missing.length===0,
  ledgerDigest:createHash('sha256').update(JSON.stringify({sourceVersion,records,missing})).digest('hex'),
  pricingStatus:'unconfigured'};
}
