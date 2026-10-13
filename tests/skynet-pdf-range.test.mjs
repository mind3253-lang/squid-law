import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchivedPdfRangeReader} from '../lib/skynet-pdf-range.mjs';

test('large PDF is opened as bounded byte ranges, not reconstructed at upload',async()=>{
 const fragmentSize=3*1024*1024;
 const chunks=Array.from({length:12},(_,i)=>new Uint8Array(fragmentSize).fill(i+1));
 const files=chunks.map((c,i)=>({pathname:'upload/'+String(i).padStart(5,'0'),
  size:c.length}));
 let reads=0;
 const range=createArchivedPdfRangeReader(files,async(name)=>{
  reads++;
  return chunks[Number(name.slice(-5))];
 },{cacheLimit:3});
 assert.equal(range.totalBytes,12*fragmentSize);
 assert.equal(reads,0,'constructor must not preload all original bytes');
 const first=await range.readRange(8,40);
 assert.equal(first.length,32);
 assert.ok(first.every(x=>x===1));
 assert.equal(reads,1);
 const crossed=await range.readRange(fragmentSize-19,fragmentSize+21);
 assert.equal(crossed.length,40);
 assert.ok(crossed.slice(0,19).every(x=>x===1));
 assert.ok(crossed.slice(19).every(x=>x===2));
 assert.equal(reads,2);
 const next=await range.readRange(6*fragmentSize+100,6*fragmentSize+500);
 assert.ok(next.every(x=>x===7));
 assert.ok(reads<12,'unneeded private blobs must not be read');
});

test('invalid ranges and altered archive fragment sizes are rejected',async()=>{
 const source=createArchivedPdfRangeReader([{pathname:'x',size:10}],
  async()=>new Uint8Array(9));
 await assert.rejects(()=>source.readRange(0,10),/LENGTH_MISMATCH/);
 await assert.rejects(()=>source.readRange(-1,5),/INVALID_PDF_BYTE_RANGE/);
 await assert.rejects(()=>source.readRange(0,11),/INVALID_PDF_BYTE_RANGE/);
 assert.throws(()=>createArchivedPdfRangeReader([{pathname:'bad',size:0}],
  async()=>new Uint8Array()),/INVALID_PDF_FRAGMENT/);
});

test('source retries only need the existing stored fragments',async()=>{
 const chunks=[Uint8Array.of(10,20,30),Uint8Array.of(40,50,60)];
 const files=chunks.map((x,i)=>({pathname:String(i),size:x.length}));
 const run=()=>createArchivedPdfRangeReader(files,async name=>chunks[Number(name)]);
 assert.deepEqual([...await run().readRange(2,5)],[30,40,50]);
 assert.deepEqual([...await run().readRange(0,6)],[10,20,30,40,50,60]);
});
