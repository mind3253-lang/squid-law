import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/customer-analysis-job.js',import.meta.url),'utf8');
test('LAW-041: customer sees verified page count but no unauthorized charge',()=>{
 assert.match(ui,/renderFullReview\(job,j\.queue,j\.progress,j\.billing\)/);
 assert.match(ui,/billing\?\.pageCountVerified/);
 assert.match(ui,/청구 없음/);
 assert.match(api,/verifiedPages:verifiedSourcePages\(allDocs\)/);
 assert.match(api,/pageCountVerified:verifiedSourcePages\(allDocs\)/);
 assert.match(api,/priceConfirmed:false,chargeAuthorized:false/);
});
