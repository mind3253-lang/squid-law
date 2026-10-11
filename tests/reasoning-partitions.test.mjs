import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {segmentRecord} from '../lib/record-chunks.mjs';
import {partitionReasoningUnits} from '../lib/reasoning-partitions.mjs';
test('10001 legal pages are partitioned without truncation or source reordering',()=>{
 const pages=Array.from({length:10001},(_,i)=>({page:i+1,text:'청구 증거 '+String(i).padStart(5,'0')}));
 const units=segmentRecord({scope:'customer',documentId:'d',pages}).segments;
 const result=partitionReasoningUnits(units,{maxCharacters:12000,maxUnits:75});
 assert.equal(result.complete,true);
 assert.equal(result.unitCount,10001);
 assert.deepEqual(result.batches.flatMap(b=>b.units.map(u=>u.page)),pages.map(p=>p.page));
 assert.ok(result.batches.every(b=>b.characters<=12000&&b.units.length<=75));
});
test('oversized single unit is rejected rather than silently cut',()=>{
 const units=segmentRecord({scope:'customer',documentId:'d',pages:[{page:1,text:'법'.repeat(11000)}]}).segments;
 assert.throws(()=>partitionReasoningUnits(units,{maxCharacters:10000}));
});
