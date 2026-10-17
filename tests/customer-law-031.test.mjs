import test from 'node:test';
import assert from 'node:assert/strict';
import {findReportEvidence} from '../lib/customer-report-evidence-search.mjs';
test('LAW-031 retrieves only related saved report findings',()=>{
 const report={findings:[{issue:'임대기간',evidence:[{file:'계약서',page:3}]},{issue:'전기료',evidence:[{file:'고지서',page:5}]}]};
 const result=findReportEvidence(report,'전기료');
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].finding.evidence[0].page,5);
 assert.equal(result.matches[0].finding.issue,'전기료');
});
test('LAW-031 does not invent answers or use a cross-case search',()=>{
 assert.deepEqual(findReportEvidence({findings:[{issue:'임대료'}]},'형사고소').matches,[]);
 assert.throws(()=>findReportEvidence({},'a'),/INVALID_REPORT_QUESTION/);
});
