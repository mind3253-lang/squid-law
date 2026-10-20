// Pure Gabia billing policy. No gateway calls or customer charges.
export function validateBillingEvent(event){
 if(!event||typeof event!=='object'||!['credit','debit','refund'].includes(event.kind)||
 !Number.isSafeInteger(event.amount)||event.amount<=0||event.amount>1000000000||
 typeof event.reference!=='string'||event.reference.length<8||event.reference.length>160)
 throw Error('INVALID_BILLING_EVENT');
 return {kind:event.kind,amount:event.amount,reference:event.reference};
}
export function calculateCreditBalance(events){
 if(!Array.isArray(events))throw Error('INVALID_BILLING_LEDGER');
 const seen=new Set();let balance=0;
 for(const item of events){
  const e=validateBillingEvent(item);
  if(seen.has(e.reference))throw Error('DUPLICATE_BILLING_REFERENCE');
  seen.add(e.reference);
  balance+=e.kind==='debit'?-e.amount:e.amount;
  if(!Number.isSafeInteger(balance)||balance<0)throw Error('INSUFFICIENT_CREDIT');
 }
 return balance;
}
export function mayChargeAnalysis({verified,usageComplete,approvedPrice}){
 return verified===true&&usageComplete===true&&Number.isSafeInteger(approvedPrice)&&approvedPrice>0;
}
