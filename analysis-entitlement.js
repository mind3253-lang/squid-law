// Server-only paid entitlement gate for private AI jobs.
// A production implementation MUST use a durable, atomic payment ledger.
// Never trust browser-supplied "paid", user IDs or page counts.
export async function authorizeAnalysisJob({entitlementId,accountId,jobId,actualPages,ledger}={}){
 if(typeof entitlementId!=='string'||!/^ent_[a-zA-Z0-9_-]{8,100}$/.test(entitlementId))throw Error('INVALID_ENTITLEMENT_ID');
 if(typeof accountId!=='string'||!accountId.trim()||accountId.length>128)throw Error('INVALID_ACCOUNT_ID');
 if(typeof jobId!=='string'||!/^job_[a-zA-Z0-9_-]{8,100}$/.test(jobId))throw Error('INVALID_JOB_ID');
 if(!Number.isInteger(actualPages)||actualPages<1||actualPages>300)throw Error('INVALID_PAGE_COUNT');
 if(!ledger||typeof ledger.consumeEntitlement!=='function')throw Error('DURABLE_LEDGER_REQUIRED');
 // consumeEntitlement must atomically verify paid status, ownership, page allowance,
 // unused job ID, and remaining balance, then reserve the entitlement.
 const result=await ledger.consumeEntitlement({entitlementId,accountId,jobId,actualPages});
 if(!result||result.accepted!==true||result.jobId!==jobId)throw Error('ENTITLEMENT_NOT_AUTHORIZED');
 return Object.freeze({jobId,accountId,entitlementId,actualPages});
}
