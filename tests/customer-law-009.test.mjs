import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const access=readFileSync(new URL('../lib/customer-case-access.mjs',import.meta.url),'utf8');
for(const name of ['customer-analysis-job.js','customer-text-review-report.js']){
 const api=readFileSync(new URL('../api/'+name,import.meta.url),'utf8');
 test('LAW-009 scoped access: '+name,()=>{
  assert.match(api,/requireOwnedCase\((?:a|auth)\.user,caseId\)/);
  assert.match(api,/if\(!registry\|\|registry\.id!==caseId\)/);
 });
}
test('LAW-009 registry is scoped to the authenticated customer',()=>{
 assert.match(access,/casePrefix\(user,'_index'\)/);
 assert.match(access,/record\?\.id===caseId/);
});
