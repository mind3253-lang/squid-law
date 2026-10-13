import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {splitRangeVisualWindows,splitRangeVisualPageSet} from '../lib/customer-pdf-visual-range.mjs';

test('multipart customer source renders only selected PDF pages for visual AI review',async()=>{
 const original=await PDFDocument.create();
 const font=await original.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=3;i++){
  const page=original.addPage([595,842]);
  page.drawText('Evidence page '+i,{x:30,y:790,size:18,font,color:rgb(0,0,0)});
 }
 const bytes=Buffer.from(await original.save({useObjectStreams:true}));
 let requested=0;
 const reader={totalBytes:bytes.length,
  async readRange(begin,end){requested++;return bytes.subarray(begin,end)}};
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const source={reader,pageCount:3};
 const pages=await splitRangeVisualWindows({source,sha256,startPage:2,count:1,pageCount:2});
 assert.equal(pages.length,1);
 assert.equal(pages[0].startPage,2);
 assert.equal(pages[0].endPage,3);
 assert.equal(pages[0].sourcePages.join(','),'2,3');
 assert.equal(pages[0].originalSha256,sha256);
 const derivative=await PDFDocument.load(pages[0].bytes);
 assert.equal(derivative.getPageCount(),2);
 const singles=await splitRangeVisualPageSet({source,sha256,pages:[1,3]});
 assert.deepEqual(singles.map(x=>x.startPage),[1,3]);
 assert.ok(requested>0);
});
