import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {extractPdfPages} from '../api/customer-pdf-extract.js';

test('synthetic PDF is valid for deployed pdf-parse engine',async()=>{
 const pdf=await PDFDocument.create();
 const page=pdf.addPage([595,842]);
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('SQUIDLAW TEST EVIDENCE',{x:48,y:780,size:16,font});
 const buf=Buffer.from(await pdf.save());
 assert.equal(buf.subarray(0,5).toString(),'%PDF-');
 const {pages,totalPages}=await extractPdfPages(buf,100);
 assert.equal(totalPages,1);
 assert.equal(pages.length,1);
 assert.match(pages[0].text,/SQUIDLAW TEST EVIDENCE/);
});
