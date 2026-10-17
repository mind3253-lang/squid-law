/**
 * Usage-based settlement policy. No money conversion, prices, credit limits
 * or automatic deductions until operator-approved pricing is configured.
 */
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function quoteCustomerUsage({estimatedUnits,lossReserveUnits=0,sourceVersion}){
 if(!valid(estimatedUnits)||!valid(lossReserveUnits)||!sourceVersion||
  estimatedUnits+lossReserveUnits>Number.MAX_SAFE_INTEGER)throw Error('INVALID_USAGE_ESTIMATE');
 return Object.freeze({sourceVersion,baselineUnits:estimatedUnits,reserveUnits:lossReserveUnits,
  minimumBillableUnits:estimatedUnits+lossReserveUnits,pricingStatus:'unconfigured'});
}
export function settleCustomerUsage({quote,measuredUnits=0,unmeasuredEstimatedUnits=0,measurementComplete=false}){
 if(!quote||!valid(quote.minimumBillableUnits)||!valid(measuredUnits)||!valid(unmeasuredEstimatedUnits)||
  measuredUnits+unmeasuredEstimatedUnits>Number.MAX_SAFE_INTEGER)throw Error('INVALID_USAGE_SETTLEMENT');
 const candidate=measuredUnits+(measurementComplete?0:unmeasuredEstimatedUnits);
 return {sourceVersion:quote.sourceVersion,minimumBillableUnits:quote.minimumBillableUnits,
  measuredUnits,unmeasuredEstimatedUnits:measurementComplete?0:unmeasuredEstimatedUnits,
  billableUnits:Math.max(quote.minimumBillableUnits,candidate),
  excessUnits:Math.max(0,candidate-quote.minimumBillableUnits),
  usageStatus:measurementComplete?'measured':'estimated_fallback',
  chargeAmount:null,pricingStatus:'unconfigured'};
}
export function checkCustomerCredit({estimatedCharge,availableCredit,graceCredit=null}){
 if(!valid(estimatedCharge)||!valid(availableCredit))return {status:'pricing_not_configured',mayStart:false};
 if(!valid(graceCredit))return {status:'grace_limit_not_configured',mayStart:false};
 const shortage=Math.max(0,estimatedCharge-availableCredit);
 return {status:shortage===0?'sufficient':shortage<=graceCredit?'grace_allowed':'top_up_required',
  mayStart:shortage<=graceCredit,shortage,topUpRequired:shortage>graceCredit?shortage-graceCredit:0};
}
