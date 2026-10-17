import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCustomerUsageLedger} from '../lib/customer-usage-ledger.mjs';
test('ledger deduplicates checkpoints and keeps missing usage visible',async()=>{
 const records=new Map([['a',{modelUsage:{model:'m',stage:'legal',inputTokens:8,outputTokens:2,totalTokens:10}}],['b',{modelUsage:{model:'m',stage:'vision',inputTokens:4,outputTokens:6,totalTokens:10}}]]);
 const ledger=await buildCustomerUsageLedger({paths:['a','b','a','c'],load:async p=>records.get(p),sourceVersion:'v1'});
 assert.equal(ledger.aggregate.totalTokens,undefined);
 assert.equal(ledger.aggregate.apiCalls,2);
 assert.equal(ledger.records.reduce((n,x)=>n+x.totalTokens,0),20);
 assert.equal(ledger.missing.length,1);
 assert.equal(ledger.complete,false);
 assert.equal(ledger.ledgerDigest.length,64);
});
