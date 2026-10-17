import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('LAW-028 customer report download is authenticated and based on same saved brief',()=>{
 const api=read('api/customer-legal-report.js');
 const client=read('customer.html');
 assert.ok(api.indexOf('const auth=guard(req)')<api.indexOf("req.query?.download"));
 assert.match(api,/res\.status\(200\)\.send\(brief\.text\)/);
 assert.match(api,/attachment; filename="squidlaw-legal-report\.txt"/);
 assert.match(client,/legalReportDownloadButton\.onclick=async/);
 assert.match(client,/download=txt/);
 assert.match(client,/legalReportDownloadButton\.hidden=false/);
});
