import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseDeltaSources,attachDiagnosticContext} from '../lib/diagnostic-context.mjs';
test('classifies empty evidence with source counts and safe recovery',()=>{
 const context=diagnoseDeltaSources({oldFinding:{sources:[{}]},newFindings:[{sources:[]}],sourceUnits:[]});
 assert.equal(context.reason,'SOURCE_UNITS_EMPTY');
 assert.equal(context.recovery,'rebuild_source_references');
 assert.equal(context.oldReferenceCount,1);
 assert.deepEqual(context.newReferenceCounts,[0]);
 assert.equal(context.sourceUnitCount,0);
});
test('distinguishes missing array from empty array',()=>{
 assert.equal(diagnoseDeltaSources({}).reason,'SOURCE_UNITS_NOT_ARRAY');
});
test('diagnostic context is not accidentally serialized as source text',()=>{
 const error=attachDiagnosticContext(new Error('failure'),{sourceUnitCount:0});
 assert.equal(error.diagnosticContext.sourceUnitCount,0);
 assert.equal(JSON.stringify(error),'{}');
});
