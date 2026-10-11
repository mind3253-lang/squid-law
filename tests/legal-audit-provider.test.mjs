import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {segmentRecord} from '../lib/record-chunks.mjs';
import {caseModel} from '../lib/case-reasoning.mjs';
import {buildIndependentAuditRequest,validateIndependentAudit} from '../lib/legal-audit-provider.mjs';
const units=segmentRecord({scope:'customer',documentId:'doc',pages:[{page:1,text:'계약기간 5년'}]}).segments;
const u=units[0],model=caseModel({caseId:'case',documents:[{id:'doc',pageCount:1}],propositions:[{id:'p',type:'claim',statement:'5년 주장',sources:[{documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,quote:'5년'}]}]});
test('independent audit requires separate reviewer and all proposition findings',()=>{
 assert.throws(()=>buildIndependentAuditRequest({model:'same',reasoningModel:'same',caseModel:model,units}));
 const request=buildIndependentAuditRequest({model:'reviewer',reasoningModel:'reasoner',caseModel:model,units});
 assert.equal(request.model,'reviewer');
 const args={caseModel:model,units,reasoningModel:'reasoner',auditModel:'reviewer'};
 assert.equal(validateIndependentAudit({...args,review:{complete:true,findings:[],missingIssues:[]}}).complete,false);
 assert.equal(validateIndependentAudit({...args,review:{mock:true,complete:true,findings:[{propositionId:'p',sourceSupported:true,semanticSupported:true}],missingIssues:[]}}).complete,false);
 assert.equal(validateIndependentAudit({...args,review:{complete:true,findings:[{propositionId:'p',sourceSupported:false,semanticSupported:true}],missingIssues:[]}}).complete,false);
 assert.equal(validateIndependentAudit({...args,review:{complete:true,findings:[{propositionId:'p',sourceSupported:true,semanticSupported:true}],missingIssues:[]}}).complete,true);
});
