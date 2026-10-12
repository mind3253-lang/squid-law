import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {auditSourceReadReceipts} from '../lib/legal-source-read-audit.mjs';
import {validateCompletionGates,REQUIRED_ANALYSIS_GATES} from '../lib/analysis-stage-gates.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
const units=Array.from({length:146},(_,i)=>{
 const text='제'+String(i+1)+'쪽 계약서와 증거내용: 서로 다른 사실관계와 지급 또는 공사 내역을 확인한다.';
 return {documentId:'case1',page:i+1,part:1,text,hash:sha(text)};
});
const receipts=units.map(u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash,status:'reviewed',quote:u.text.slice(0,20),summary:'제'+u.page+'쪽의 계약서와 증거내용을 확인하여 검토 대상 사실관계를 분류함'}));
test('all 146 source units need individually anchored reading receipts',()=>{
 const audit=auditSourceReadReceipts({units,receipts});
 assert.equal(audit.complete,true);
 assert.equal(audit.reviewedUnits,146);
 assert.equal(audit.coverageRate,1);
});
test('missing source unit blocks review even when other pages have receipts',()=>{
 const audit=auditSourceReadReceipts({units,receipts:receipts.slice(0,145)});
 assert.equal(audit.complete,false);
 assert.ok(audit.failures.some(x=>x.startsWith('SOURCE_REVIEW_MISSING_UNIT:')));
});
test('repeated source receipt cannot fill omitted pages',()=>{
 const copy=receipts.slice(0,145).concat(receipts[3]);
 const audit=auditSourceReadReceipts({units,receipts:copy});
 assert.equal(audit.complete,false);
 assert.ok(audit.failures.some(x=>x.startsWith('SOURCE_REVIEW_UNKNOWN_OR_DUPLICATE:')));
});
test('fabricated quote and generic summary do not count as review',()=>{
 const fake=receipts.map(x=>({...x}));
 fake[27].quote='원문에는 없는 거짓 인용입니다';
 fake[40].summary='확인함';
 const audit=auditSourceReadReceipts({units,receipts:fake});
 assert.equal(audit.complete,false);
 assert.ok(audit.failures.some(x=>x.startsWith('SOURCE_REVIEW_QUOTE_NOT_IN_SOURCE:')));
 assert.ok(audit.failures.some(x=>x.startsWith('SOURCE_REVIEW_EMPTY_SUMMARY:')));
});
test('a claimed empty page cannot conceal a populated page',()=>{
 const fake=receipts.map(x=>({...x}));
 fake[0].status='empty';fake[0].quote='';
 assert.equal(auditSourceReadReceipts({units,receipts:fake}).complete,false);
});
test('completed status requires new sourceReadReview gate',()=>{
 const version='a'.repeat(64);
 const gates=Object.fromEntries(REQUIRED_ANALYSIS_GATES.map(k=>[k,{verified:true,sourceVersion:version}]));
 assert.equal(validateCompletionGates(gates).complete,true);
 delete gates.sourceReadReview;
 const result=validateCompletionGates(gates);
 assert.equal(result.complete,false);
 assert.ok(result.missing.includes('sourceReadReview'));
});
