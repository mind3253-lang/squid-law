import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteCustomerUsage,settleCustomerUsage,checkCustomerCredit} from '../lib/customer-usage-settlement.mjs';
test('estimated usage is a minimum, not a page-count price',()=>{
 const quote=quoteCustomerUsage({estimatedUnits:1000,lossReserveUnits:100,sourceVersion:'v1'});
 assert.equal(settleCustomerUsage({quote,measuredUnits:800,measurementComplete:true}).billableUnits,1100);
 assert.equal(settleCustomerUsage({quote,measuredUnits:1400,measurementComplete:true}).excessUnits,300);
 assert.equal(settleCustomerUsage({quote,measuredUnits:400,unmeasuredEstimatedUnits:800}).billableUnits,1200);
 assert.equal(settleCustomerUsage({quote,measuredUnits:400}).usageStatus,'estimated_fallback');
});
test('credit gate cannot silently invent an overdraft threshold',()=>{
 assert.equal(checkCustomerCredit({estimatedCharge:500,availableCredit:450}).mayStart,false);
 assert.equal(checkCustomerCredit({estimatedCharge:500,availableCredit:450,graceCredit:60}).mayStart,true);
 assert.equal(checkCustomerCredit({estimatedCharge:500,availableCredit:200,graceCredit:60}).status,'top_up_required');
});
