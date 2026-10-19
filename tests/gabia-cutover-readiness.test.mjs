import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGabiaCutover,assessVercelRetirement} from '../deploy/gabia-cutover-readiness.mjs';
test('no DNS cutover or retirement without real E2E evidence',()=>{
 const result=assessGabiaCutover();
 assert.equal(result.ready,false);
 assert.equal(result.dnsChangeAllowed,false);
 assert.equal(result.vercelRetirementAllowed,false);
 assert.ok(result.missing.includes('analysisE2eCompleted'));
 assert.equal(assessVercelRetirement().allowed,false);
});
test('even fully verified cutover cannot retire Vercel without monitoring and approval',()=>{
 const all=Object.fromEntries(assessGabiaCutover().missing.map(key=>[key,true]));
 assert.equal(assessGabiaCutover(all).dnsChangeAllowed,true);
 assert.equal(assessGabiaCutover(all).vercelRetirementAllowed,false);
 assert.equal(assessVercelRetirement({cutoverEvidence:all}).allowed,false);
 assert.equal(assessVercelRetirement({cutoverEvidence:all,productionMonitoringVerified:true,legacyDataAccessible:true,ownerApproved:true}).allowed,true);
});
