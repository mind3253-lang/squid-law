import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {segmentRecord} from '../lib/record-chunks.mjs';
import {caseModel,verifyCitedPropositions,independentCaseAudit} from '../lib/case-reasoning.mjs';
test('fabricated evidence quote and page are rejected',()=>{
 const units=segmentRecord({scope:'customer',documentId:'contract',pages:[{page:77,text:'임대차계약기간은 5년이다.'}]}).segments;
 const source=units[0];
 const correct={id:'p1',type:'claim',statement:'5년 계약 주장',sources:[{documentId:source.documentId,page:source.page,part:source.part,hash:source.hash,quote:'5년'}]};
 assert.equal(verifyCitedPropositions(units,[correct]).complete,true);
 assert.equal(verifyCitedPropositions(units,[{...correct,sources:[{...correct.sources[0],quote:'2년'}]}]).complete,false);
 assert.equal(verifyCitedPropositions(units,[{...correct,sources:[{...correct.sources[0],page:1}]}]).complete,false);
});
test('complete-looking claims cannot bypass independent legal audit',()=>{
 const units=segmentRecord({scope:'customer',documentId:'contract',pages:[{page:1,text:'청구'}]}).segments;
 const source=units[0];
 const model=caseModel({caseId:'case',documents:[{id:'contract',pageCount:1,name:'계약'}],propositions:[{id:'p',type:'claim',statement:'청구',status:'independently_verified',sources:[{documentId:source.documentId,page:source.page,part:source.part,hash:source.hash,quote:'청구'}]}]});
 const coverage={contract:{complete:true}};
 assert.equal(independentCaseAudit({units,model,documentCoverage:coverage,visualCoverage:coverage}).complete,false);
 assert.equal(independentCaseAudit({units,model,documentCoverage:coverage,visualCoverage:coverage,semanticAudit:{complete:true,modelVersion:'wrong',reviewerIndependent:true}}).complete,false);
 assert.equal(independentCaseAudit({units,model,documentCoverage:coverage,visualCoverage:coverage,semanticAudit:{complete:true,modelVersion:model.version,reviewerIndependent:true}}).complete,true);
});

test('same document/page/part cannot contain conflicting source text',()=>{
 const first=segmentRecord({scope:'customer',documentId:'d',pages:[{page:1,text:'원본 A'}]}).segments[0];
 const second=segmentRecord({scope:'customer',documentId:'d',pages:[{page:1,text:'원본 B'}]}).segments[0];
 assert.throws(()=>verifyCitedPropositions([first,second],[]),/DUPLICATE_SOURCE_UNIT/);
});
