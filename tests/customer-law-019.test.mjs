import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineFromFacts} from '../api/customer-case-knowledge.js';
test('LAW-019 normalizes and sorts source dates without inventing event dates',()=>{
 const facts=[{id:'a',dates:['2026.10.2','2026.02.30','2025/12/31'],statement:'계약일 언급',source:{documentId:'d1',page:2}}];
 const result=timelineFromFacts(facts);
 assert.deepEqual(result.map(x=>x.date),['2025-12-31','2026-10-02']);
 assert.ok(result.every(x=>x.status==='검토 필요'&&x.dateType.includes('미확정')));
 assert.equal(result[0].source.page,2);
});
