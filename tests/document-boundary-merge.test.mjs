import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mergeBoundaryCandidates} from '../lib/document-boundary-merge.mjs';
test('same logical document across batch boundary merges without page loss',()=>{
 const a={sections:[{documentId:'d',kind:'준비서면',classification:'미검증 후보',startPage:1,endPage:20,pages:Array.from({length:20},(_,i)=>i+1)}]};
 const b={sections:[{documentId:'d',kind:'준비서면',classification:'미검증 후보',startPage:21,endPage:40,pages:Array.from({length:20},(_,i)=>i+21)}]};
 const result=mergeBoundaryCandidates([b,a]);assert.equal(result.sections.length,1);assert.equal(result.coveredPages,40);assert.equal(result.verified,false);
});
test('different documents, overlap and gaps are never silently merged',()=>{
 const a={sections:[{documentId:'d',kind:'소장',classification:'미검증 후보',startPage:1,endPage:2,pages:[1,2]}]};
 const b={sections:[{documentId:'d',kind:'소장',classification:'미검증 후보',startPage:2,endPage:3,pages:[2,3]}]};
 assert.throws(()=>mergeBoundaryCandidates([a,b]));
 assert.throws(()=>mergeBoundaryCandidates([{sections:[{documentId:'d',kind:'소장',classification:'미검증 후보',startPage:1,endPage:3,pages:[1,3]}]}]));
});
