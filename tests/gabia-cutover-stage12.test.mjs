import test from 'node:test';
import assert from 'node:assert/strict';
import {gabiaCutoverPlan,gabiaRetirementPlan} from '../lib/gabia-cutover-plan.mjs';
test('production cutover cannot proceed on code-only evidence',()=>{
 const plan=gabiaCutoverPlan({databaseMigrated:true});
 assert.equal(plan.ready,false);
 assert.ok(plan.missing.includes('realE2EVerified'));
 assert.ok(plan.missing.includes('operatorApproved'));
});
test('provider retirement requires a distinct approval after stable cutover',()=>{
 assert.equal(gabiaRetirementPlan({cutoverStable:true}).ready,false);
 assert.equal(gabiaRetirementPlan({cutoverStable:true,explicitRetirementApproval:true}).ready,true);
});
