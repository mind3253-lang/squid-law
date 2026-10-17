import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeVisualWindows} from '../lib/pdf-visual-windows.mjs';
const digest='a'.repeat(64);
const window=(startPage,endPage)=>({documentId:'doc',sourcePdfSha256:digest,startPage,endPage,observations:{pageObservations:Array.from({length:endPage-startPage+1},(_,i)=>({page:startPage+i,observedText:''})),unreviewedPages:[]}});
test('LAW-013 merges source-mapped windows of non-default sizes',()=>{
 const result=mergeVisualWindows({documentId:'doc',sourcePdfSha256:digest,pageCount:5,windows:[window(1,2),window(3,5)]});
 assert.deepEqual(result.observations.pageObservations.map(p=>p.page),[1,2,3,4,5]);
});
test('LAW-013 rejects swapped source-page attribution',()=>{
 const altered=window(3,5);altered.observations.pageObservations[0].page=2;
 assert.throws(()=>mergeVisualWindows({documentId:'doc',sourcePdfSha256:digest,pageCount:5,windows:[window(1,2),altered]}),/PAGE_OUT_OF_RANGE/);
});
