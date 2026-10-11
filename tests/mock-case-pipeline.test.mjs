import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {runMockCasePipeline} from '../lib/mock-case-pipeline.mjs';
const docs=[{id:'contract',name:'계약서',pageCount:2,pages:[{page:1,text:'2023.11.07 임대차기간 5년'},{page:2,text:'원고의 주장'}]}];
const source=u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,quote:'5년'});
test('mock full-stage pipeline cannot finalize without vision and independent audit',()=>{
 const base={caseId:'test-case',documents:docs,modelProvider:({units})=>[{id:'claim',type:'claim',statement:'계약기간',sources:[source(units[0])]}]};
 const incomplete=runMockCasePipeline(base);
 assert.equal(incomplete.status,'blocked');
 assert.deepEqual(incomplete.audit.visualMissing,['contract']);
 const complete=runMockCasePipeline({...base,visualProvider:plan=>({documentId:plan.documentId,pages:plan.pages.map(p=>({page:p.page,textHash:p.textHash,images:[]}))}),semanticVerifier:({model})=>({complete:true,modelVersion:model.version,reviewerIndependent:true})});
 assert.equal(complete.status,'blocked'); // Unverified model proposition cannot be treated as independently checked
 const verified=runMockCasePipeline({...base,modelProvider:({units})=>[{id:'claim',type:'claim',statement:'계약기간',status:'independently_verified',sources:[source(units[0])]}],visualProvider:plan=>({documentId:plan.documentId,pages:plan.pages.map(p=>({page:p.page,textHash:p.textHash,images:[]}))}),semanticVerifier:({model})=>({complete:true,modelVersion:model.version,reviewerIndependent:true})});
 assert.equal(verified.status,'mock_completed');
 assert.equal(verified.mock,true);
});
test('mock pipeline fails on incomplete pages',()=>assert.throws(()=>runMockCasePipeline({caseId:'x',documents:[{id:'d',pageCount:2,pages:[{page:1,text:'a'}]}],modelProvider:()=>[]})));
