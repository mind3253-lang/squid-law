import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLegalAuthorities} from '../lib/legal-authority-audit.mjs';
test('LAW-023 detects cited precedent and statute as unverified',()=>{
 const result=auditLegalAuthorities([{claim:'대법원 2022다202740 판결과 민법 제390조를 근거로 주장한다'}]);
 assert.equal(result.complete,false);
 assert.equal(result.references.length,2);
 assert.ok(result.issues.every(x=>x.startsWith('LEGAL_AUTHORITY_UNVERIFIED')));
});
test('LAW-023 does not confuse document evidence with external authority verification',()=>{
 assert.equal(auditLegalAuthorities([{claim:'계약서 제3항을 근거로 주장'}]).complete,true);
});
