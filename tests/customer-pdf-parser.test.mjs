import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
process.env.SQUID_TEST_PDF_ONLY='true';
const {makePdf}=await import('../scripts/production-customer-e2e.mjs');
(existsSync(new URL('../tests/fixtures/ci-evidence.pdf',import.meta.url))?test:test.skip)('synthetic PDF is valid for deployed pdf-parse engine',async()=>{
 const buf=makePdf();
 assert.ok(buf.subarray(0,5).toString()==='%PDF-');
 const {extractPdfPages}=await import('../api/customer-pdf-extract.js');
 const {pages,totalPages}=await extractPdfPages(buf,100);
 assert.equal(totalPages,1);
 assert.equal(pages.length,1);
 assert.match(pages[0].text,/SQUIDLAW TEST EVIDENCE/);
});
