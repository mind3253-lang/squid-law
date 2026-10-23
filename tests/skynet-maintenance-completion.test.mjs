import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVerifiedJob} from '../lib/skynet-worker-completion.mjs';
import {buildMaintenancePlan} from '../lib/diagnostic-context.mjs';
const phases=['diagnosis','source_validation','implementation','regression','deployment','production_verification'];
const job=()=>({id:'maintenance-test-job',status:'running',owner:'tester',tasks:[{id:'task-1',status:'verified',evidence:['verified-test']}],operations:{},events:[],revision:1});
test('SKYNET blocks maintenance completion without production verification',()=>{
 const j=job();j.maintenancePlan=buildMaintenancePlan({checks:phases.slice(0,5).map(phase=>({phase,status:'passed'}))});
 assert.throws(()=>completeVerifiedJob(j,'tester'),/MAINTENANCE_PHASES_INCOMPLETE/);
});
test('SKYNET requires explicit production verification evidence',()=>{
 const j=job();j.maintenancePlan=buildMaintenancePlan({checks:phases.map(phase=>({phase,status:'passed'}))});
 assert.throws(()=>completeVerifiedJob(j,'tester'),/PRODUCTION_VERIFICATION_MISSING/);
});
