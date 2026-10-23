import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceIntakesFromDiagnostics} from '../lib/skynet-maintenance-diagnostic-bridge.mjs';
const trace='ERR-993efc74-8364-41d3-8f1b-74499aba1355';
test('diagnostics produce deduplicated read-only plans',()=>{
 const result=maintenanceIntakesFromDiagnostics({jobsStatus:'available',records:[{traceId:trace,code:'DELTA_SOURCE_REFERENCES_MISSING',sourceDiagnostic:{reason:'SOURCE_UNITS_EMPTY'}},{traceId:trace,code:'DELTA_SOURCE_REFERENCES_MISSING'}]});
 assert.equal(result.intakes.length,1);
 assert.equal(result.intakes[0].tasks.length,6);
 assert.equal(result.intakes[0].requiresApproval,true);
});
test('diagnostic storage outage cannot create work',()=>{
 const result=maintenanceIntakesFromDiagnostics({jobsStatus:'query_failed',records:[]});
 assert.equal(result.status,'diagnostics_unavailable');
});
