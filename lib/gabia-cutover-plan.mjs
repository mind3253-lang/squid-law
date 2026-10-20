// Stage 12: cutover remains a manual, separately approved operation.
// This module never changes DNS, starts workers, or retires any provider.
import {gabiaCutoverReadiness} from './gabia-cutover-guard.mjs';
export function gabiaCutoverPlan(checks,{operatorApproved=false}={}){
 const readiness=gabiaCutoverReadiness(checks);
 const missing=[...readiness.missing];
 if(checks?.realE2EVerified!==true)missing.push('realE2EVerified');
 if(checks?.dnsRollbackTested!==true)missing.push('dnsRollbackTested');
 if(operatorApproved!==true)missing.push('operatorApproved');
 return {ready:missing.length===0,missing,actionsAllowed:missing.length===0?['manual_cutover_review']:[]};
}
export function gabiaRetirementPlan({cutoverStable=false,explicitRetirementApproval=false}={}){
 return {ready:cutoverStable===true&&explicitRetirementApproval===true};
}
