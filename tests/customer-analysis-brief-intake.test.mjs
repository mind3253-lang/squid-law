import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCaseIntake,intakeForReport,validClientRole,filedCaseHeadingComplete} from '../lib/customer-case-intake.mjs';
import {buildCustomerAnalysisBrief,SQUIDLAW_REPORT_CLOSING} from '../lib/customer-analysis-brief.mjs';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const metadata={clientRole:'defendant',isFiledCase:true,courtCaseNumber:'2026가단12878',
 plaintiffName:'주식회사 고고다이브',defendantName:'이서현',
 claimRelief:'피고는 원고에게 30,000,000원 및 지연손해금을 지급하라.'};
const record={id:'SL-demo-case',intake:metadata};
const findings=[
 {issueKey:'대여금 2,000만 원',type:'claim',party:'plaintiff',
  claim:'원고는 2,000만 원 반환을 청구합니다.',sources:[{documentId:'d',page:2,part:1}]},
 {issueKey:'대여금 2,000만 원',type:'rebuttal',party:'defendant',
  claim:'피고는 정산 완료를 주장합니다.',sources:[{documentId:'d',page:199,part:1}],
  contradiction:'다른 사건에서 이미 2,000만 원을 공제했다는 진술과 현재 청구를 대조해야 합니다.',
  analysis:'해당 대여금이 동일 채권인지 확인할 필요가 있습니다.',
  evidenceNeed:'선행 판결 및 거래별 정산자료'},
 {issueKey:'추가보증금 1,000만 원',type:'claim',party:'plaintiff',
  claim:'원고는 추가보증금 환급을 구합니다.',sources:[{documentId:'d',page:3,part:1}]}
];
test('plaintiff or defendant is mandatory; court metadata is optional at intake',()=>{
 assert.throws(()=>normalizeCaseIntake({}),/원고인가요/);
 assert.throws(()=>normalizeCaseIntake({clientRole:'both'}),/원고인가요/);
 assert.deepEqual(normalizeCaseIntake({...metadata}),metadata);
 assert.equal(validClientRole('defendant'),true);
 assert.equal(filedCaseHeadingComplete(record),true);
 assert.equal(filedCaseHeadingComplete({intake:{clientRole:'plaintiff',isFiledCase:true}}),false);
 assert.equal(filedCaseHeadingComplete({intake:{clientRole:'plaintiff',isFiledCase:false}}),true);
 assert.equal(intakeForReport(record).clientRoleLabel,'피고');
});
test('court style case, prayer, chapters and client-tailored results appear in that order',()=>{
 const brief=buildCustomerAnalysisBrief({caseRecord:record,report:{findings,notForCourtSubmission:false,independentSemanticAuditPassed:true},documents:[{id:'d',name:'12878 사건기록.pdf'}]});
 const text=brief.text;
 for(const key of ['사건번호 : 2026가단12878','원고 : 주식회사 고고다이브','피고 : 이서현',
  '청구취지','제1장. 쟁점 도표 정리','제2장. 분석','원고 : 원고는','피고 : 피고는','모순 :','제3장. 결과',SQUIDLAW_REPORT_CLOSING]){
  assert.ok(text.includes(key),'missing '+key);
 }
 assert.ok(text.indexOf('청구취지')<text.indexOf('제1장'));
 assert.ok(text.indexOf('제1장')<text.indexOf('제2장'));
 assert.ok(text.indexOf('제2장')<text.indexOf('제3장'));
 assert.match(text,/[^[]PDF|12878 사건기록\.pdf 199쪽/);
 assert.equal(brief.clientRole,'defendant');
 assert.doesNotMatch(text,/원문 검증 100%/);
});
test('cannot invent a self contradiction or assume unidentified party',()=>{
 const brief=buildCustomerAnalysisBrief({caseRecord:{intake:{clientRole:'plaintiff',isFiledCase:false}},report:{findings:[{type:'claim',claim:'사건 개요만 있습니다.',sources:[]}]}});
 assert.match(brief.text,/법원 미접수 사건/);
 assert.match(brief.text,/의뢰인 : 원고/);
 assert.match(brief.text,/진술과 제출서면이 서로 다른 부분을 구분/);
 assert.doesNotMatch(brief.text,/진술의 전후 차이가 자료에 나타나므로/);
 assert.match(brief.text,/해당 당사자의 주장이 별도로 특정되지 않았습니다/);
 assert.throws(()=>buildCustomerAnalysisBrief({caseRecord:{intake:{}},report:{findings:[]}}),/CLIENT_ROLE_REQUIRED/);
});
test('customer API and UI require intake; customer chat no longer bills AI advice',()=>{
 const ui=src('customer.html');
 const cases=src('api/customer-cases.js');
 const jobs=src('api/customer-analysis-job.js');
 const notes=src('api/customer-case.js');
 const chat=src('api/customer-analysis.js');
 assert.match(ui,/원고인가요\? 피고인가요\?/);
 assert.match(ui,/name="caseClientRole"/);
 assert.match(ui,/caseClaimRelief/);
 assert.match(ui,/action:'note'/);
 assert.match(cases,/normalizeCaseIntake/);
 assert.match(jobs,/CLIENT_ROLE_REQUIRED/);
 assert.match(notes,/action==='note'/);
 assert.match(chat,/code:'LEGAL_CHAT_DISABLED'/);
});
