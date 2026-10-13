import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchivedPdfRangeReader} from '../lib/skynet-pdf-range.mjs';
import {extractPdfPagesByRange} from '../api/customer-pdf-extract.js';

function makeTwoPagePdf(){
 const p1='BT /F1 14 Tf 72 700 Td (First page evidence) Tj ET';
 const p2='BT /F1 14 Tf 72 700 Td (Second page evidence) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+p1.length+' >>\nstream\n'+p1+'\nendstream',
  '<< /Length '+p2.length+' >>\nstream\n'+p2+'\nendstream'
 ];
 const pieces=['%PDF-1.4\n'],offsets=[0];let bytes=pieces[0].length;
 for(let i=0;i<objects.length;i++){
  offsets.push(bytes);
  const piece=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
  pieces.push(piece);bytes+=piece.length;
 }
 // Source may contain a large unused gap. PDF.js should fetch only needed
 // byte ranges, never require the caller to Buffer.concat the original.
 const padding=' '.repeat(1024*1024);
 pieces.push(padding);bytes+=padding.length;
 const xrefAt=bytes;
 const xref='xref\n0 8\n0000000000 65535 f \n'+
  offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+
  'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xrefAt+'\n%%EOF\n';
 pieces.push(xref);
 return Buffer.from(pieces.join(''),'latin1');
}

test('real PDF.js extracts both pages from private Blob-style byte range callbacks',async()=>{
 const bytes=makeTwoPagePdf(),fragmentSize=192*1024;
 const originals=[];
 for(let start=0;start<bytes.length;start+=fragmentSize)
  originals.push(bytes.subarray(start,Math.min(bytes.length,start+fragmentSize)));
 const files=originals.map((x,i)=>({pathname:'chunk-'+i,size:x.length}));
 let reads=0;
 const build=()=>createArchivedPdfRangeReader(files,async name=>{
  reads++;return originals[Number(name.slice(6))];
 },{cacheLimit:3});
 const a=await extractPdfPagesByRange(build(),{startPage:1,pageCount:1,fastTextOnly:true});
 assert.equal(a.totalPages,2);
 assert.equal(a.pages.length,1);
 assert.match(a.pages[0].text,/First page evidence/);
 const b=await extractPdfPagesByRange(build(),{startPage:2,pageCount:1,fastTextOnly:true});
 assert.equal(b.pages.length,1);
 assert.equal(b.pages[0].page,2);
 assert.match(b.pages[0].text,/Second page evidence/);
 assert.ok(reads>0);
});
