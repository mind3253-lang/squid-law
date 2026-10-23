import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceJobFromDiagnostic} from '../lib/skynet-maintenance-registration.mjs';
const data={traceId:'ERR-993efc74-8364-41d3-8f1b-74499aba1355',code:'DELTA_SOURCE_REFERENCES_MISSING',diagnostic:{reason:'SOURCE_UNITS_EMPTY'}};
test('registration is deterministic and cannot write by default',()=>{
 const a=maintenanceJobFromDiagnostic(data),b=maintenanceJobFromDiagnostic(data);
 assert.equal(a.id,b.id);
 assert.equal(a.kind,'maintenance');
 assert.equal(a.tasks.length,6);
 assert.deepEqual(a.scopes,['repository:read','deployment:read']);
 assert.equal(a.maintenancePlan.verified,false);
});
