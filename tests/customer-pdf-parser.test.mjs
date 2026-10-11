import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SQUID_TEST_PDF_ONLY='true';
const {makePdf}=await import('../scripts/production-customer-e2e.mjs');
test('synthetic PDF is valid for deployed pdf-parse engine',async()=>{
 const buf=makePdf();
 assert.ok(buf.subarray(0,5).toString()==='%PDF-');
 const pdf=(await import('pdf-parse')).default;
 const pages=[];
 let page=0;
 const parsed=await pdf(buf,{max:100,pagerender:async p=>{
  const n=++page;
  const t=await p.getTextContent();
  pages.push({page:n,text:t.items.map(x=>x.str||'').join(' ')});
  return '';
 }});
 assert.equal(parsed.numpages,1);
 assert.equal(pages.length,1);
 assert.match(pages[0].text,/SQUIDLAW TEST EVIDENCE/);
});
