import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {assertPageBatch,assertBatchManifest} from '../lib/batch-integrity.mjs';
test('338-page batches and 10001-page manifests are exact',()=>{
 for(const count of [338,10001]){
  const batches=Array.from({length:Math.ceil(count/20)},(_,i)=>'batch-'+i+'.json');
  assert.equal(assertBatchManifest({batches,pageCount:count}),true);
  let visited=0;
  for(let offset=0;offset<count;offset+=20){
   const pages=Array.from({length:Math.min(20,count-offset)},(_,i)=>({page:offset+i+1}));
   const result=assertPageBatch({pages,pageOffset:offset,pageCount:count});
   visited+=pages.length;
   assert.equal(result.finished,offset+pages.length===count);
  }
  assert.equal(visited,count);
 }
});
test('short, duplicate and wrong-page batches cannot advance',()=>{
 assert.throws(()=>assertPageBatch({pages:[{page:1}],pageOffset:0,pageCount:338}));
 assert.throws(()=>assertPageBatch({pages:Array.from({length:20},()=>({page:1})),pageOffset:0,pageCount:338}));
 assert.throws(()=>assertPageBatch({pages:[{page:22}],pageOffset:21,pageCount:338}));
 assert.throws(()=>assertBatchManifest({batches:['same.json','same.json'],pageCount:40}));
});
