import test from 'node:test';
import assert from 'node:assert/strict';
import {planMaintenanceRollback,verifyRollback} from '../lib/skynet-maintenance-rollback.mjs';
const deployment={id:'deploy-1',commit:'abc'};
test('rollback requires failed health and matching verified backup',()=>{
 assert.equal(planMaintenanceRollback({deployment,health:{status:'failed'}}).allowed,false);
 assert.equal(planMaintenanceRollback({deployment,backup:{id:'backup-1',verified:true,deploymentId:'other'},health:{status:'failed'}}).allowed,false);
 assert.equal(planMaintenanceRollback({deployment,backup:{id:'backup-1',verified:true,deploymentId:'deploy-1'},health:{status:'healthy'}}).allowed,false);
});
test('rollback cannot be marked done before production verification',()=>{
 const plan=planMaintenanceRollback({deployment,backup:{id:'backup-1',verified:true,deploymentId:'deploy-1'},health:{status:'failed'}});
 assert.equal(plan.allowed,true);
 assert.equal(plan.requiresApproval,true);
 assert.equal(verifyRollback({plan,result:{restored:true,servicesActive:true}}).complete,false);
 assert.equal(verifyRollback({plan,result:{restored:true,servicesActive:true,productionChecked:true}}).complete,true);
});
