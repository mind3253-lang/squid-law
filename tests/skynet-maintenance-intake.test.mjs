import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaintenanceIntake,maintenanceNextAction} from '../lib/skynet-maintenance-intake.mjs';
test('diagnostic intake creates ordered non-destructive tasks',()=>{
 const intake=createMaintenanceIntake({traceId:'ERR-993efc74-8364-41d3-8f1b-74499aba1355',code:'DELTA_SOURCE_REFERENCES_MISSING',diagnostic:{reason:'SOURCE_UNITS_EMPTY'}});
 assert.equal(intake.tasks.length,6);
 assert.equal(intake.requiresApproval,true);
 assert.deepEqual(intake.tasks[1].dependsOn,['maintenance-diagnosis']);
 assert.equal(maintenanceNextAction(intake).phase,'diagnosis');
 assert.equal(intake.tasks.some(t=>t.toolCalls?.length),false);
});
test('invalid diagnostics cannot be submitted',()=>{
 assert.throws(()=>createMaintenanceIntake({traceId:'bad',code:'ERROR'}),/INVALID_MAINTENANCE_TRACE/);
});
