import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCreditBalance,mayChargeAnalysis} from '../lib/gabia-billing-policy.mjs';
import {normalizePaymentNotice} from '../lib/gabia-payment-notice.mjs';
test('credit ledger detects duplicate reference and insufficient balance',()=>{
 const e={kind:'credit',amount:100,reference:'transaction-001'};
 assert.equal(calculateCreditBalance([e]),100);
 assert.throws(()=>calculateCreditBalance([e,e]),/DUPLICATE/);
 assert.throws(()=>calculateCreditBalance([{kind:'debit',amount:1,reference:'transaction-002'}]),/INSUFFICIENT/);
});
test('analysis charge is blocked before verification',()=>{
 assert.equal(mayChargeAnalysis({verified:false,usageComplete:true,approvedPrice:100}),false);
 assert.equal(mayChargeAnalysis({verified:true,usageComplete:true,approvedPrice:100}),true);
});
test('unsigned gateway notices cannot change credit ledger',()=>{
 assert.throws(()=>normalizePaymentNotice({status:'paid',providerTransactionId:'payment-001',amount:100}),/UNVERIFIED/);
});
