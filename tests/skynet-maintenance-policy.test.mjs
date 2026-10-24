import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceSeverity,maintenanceFingerprint,verifyRepairTransition,maintenanceReportWithRepairs} from '../lib/skynet-maintenance-policy.mjs';
test('severity protects high-risk systems',()=>{
 assert.equal(maintenanceSeverity('PAYMENT_FAILURE'),'critical');
 assert.equal(maintenanceSeverity('BOUNDARY_API_404'),'warning');
 assert.equal(maintenanceSeverity('CSS_LAYOUT'),'normal');
});
test('verification evidence is mandatory, deployment alone is not success',()=>{
 assert.throws(()=>verifyRepairTransition('verifying','verified'),/EVIDENCE_REQUIRED/);
 assert.throws(()=>verifyRepairTransition('pending','verified'),/INVALID_REPAIR_TRANSITION/);
 assert.equal(verifyRepairTransition('verifying','verified',{verificationReference:'run-123',verificationMethod:'production-smoke'}).verified,true);
});
test('group repeats but preserve every occurrence; reopened errors are visible',()=>{
 const events=[
  {traceId:'ERR-a',code:'BOUNDARY_API_404',stage:'boundary',observedAt:'2026-10-24T10:00:00Z'},
  {traceId:'ERR-b',code:'BOUNDARY_API_404',stage:'boundary',observedAt:'2026-10-25T10:00:00Z'}];
 const r=maintenanceReportWithRepairs({status:'report_ready',events,totals:{}},[
  {traceId:'ERR-a',status:'verified',verificationReference:'test-1',verificationMethod:'smoke'},
  {traceId:'ERR-b',status:'reopened'}]);
 assert.equal(r.groups.length,1);assert.equal(r.groups[0].count,2);
 assert.equal(r.events[0].repair.status,'reopened');
 assert.equal(r.events[1].repair.verified,true);
 assert.equal(r.monitor.repairAutomation,'disabled');
 assert.equal(maintenanceFingerprint(events[0]),maintenanceFingerprint(events[1]));
});
test('missing source stays degraded and unverified status stays pending',()=>{
 const r=maintenanceReportWithRepairs({status:'partial_sources_unavailable',events:[{traceId:'ERR-x',code:'OTHER',stage:'read'}],totals:{}});
 assert.equal(r.monitor.status,'degraded');assert.equal(r.events[0].repair.status,'pending');
});
