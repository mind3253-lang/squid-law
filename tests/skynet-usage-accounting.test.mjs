import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSkynetRequestUnits,skynetUsageAccounting} from '../lib/skynet-token-usage.mjs';
test('SKYNET shares usage settlement policy and is isolated from legal jobs',()=>{
 const estimatedUnits=estimateSkynetRequestUnits({messages:[{content:'안녕'}],maxOutputTokens:100});
 const a=skynetUsageAccounting({model:'gpt-test',estimatedUnits,usage:{prompt_tokens:30,completion_tokens:10,total_tokens:40}});
 assert.equal(a.service,'skynet');assert.equal(a.settlement.billableUnits,estimatedUnits);
 const b=skynetUsageAccounting({model:'gpt-test',estimatedUnits,usage:{prompt_tokens:200,completion_tokens:100,total_tokens:300}});
 assert.equal(b.settlement.billableUnits,300);
 const c=skynetUsageAccounting({model:'gpt-test',estimatedUnits});
 assert.equal(c.settlement.usageStatus,'estimated_fallback');assert.equal(c.settlement.billableUnits,estimatedUnits);
 assert.equal(c.chargeAmount,null);
});
