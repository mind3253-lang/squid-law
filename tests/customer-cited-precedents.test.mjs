import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCitedPrecedentsFromPages,collectCitedPrecedents} from '../lib/customer-cited-precedents.mjs';
import {buildCustomerAnalysisBrief} from '../lib/customer-analysis-brief.mjs';
import {readFileSync} from 'node:fs';

const doc=(id,sha='a'.repeat(64),pageCount=1)=>({id,sha256:sha,pageCount,name:id+'.pdf'});

test('a cited Supreme Court case survives PDF source inventory with its actual page',()=>{
 const rows=extractCitedPrecedentsFromPages([{documentId:'new',page:2,
  text:'고소인은 대법원 2012도14516 판결의 기망 관련 법리가 본 사건에 적용된다고 주장한다.'}]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].caseNumber,'2012도14516');
 assert.equal(rows[0].page,2);
 assert.match(rows[0].citationContext,/본 사건에 적용/);
});

test('an uncited docket number is not mislabeled precedent; a bare cited case is kept',()=>{
 const rows=extractCitedPrecedentsFromPages([{documentId:'new',page:1,
  text:'본건 사건번호 2026가단12498. 판례로 2017도12345 판결을 인용한다.'}]);
 assert.deepEqual(rows.map(x=>x.caseNumber),['2017도12345']);
});

test('verified PDF batches are checked against document hash and page coverage',async()=>{
 const d=doc('new');
 const rows=await collectCitedPrecedents({documents:[d],loadBatch:async()=>({
  documentId:'new',sourcePdfSha256:d.sha256,pages:[{page:1,text:'대법원 2017도12345 판결 참고'}]
 })});
 assert.equal(rows[0].caseNumber,'2017도12345');
 await assert.rejects(collectCitedPrecedents({documents:[d],loadBatch:async()=>({
  documentId:'new',sourcePdfSha256:'bad',pages:[{page:1,text:'대법원 2017도12345 판결 참고'}]
 })}),/CITED_PRECEDENT_VERIFIED_BATCH_MISSING/);
 await assert.rejects(collectCitedPrecedents({documents:[d],loadBatch:async()=>({
  documentId:'new',sourcePdfSha256:d.sha256,pages:[{page:2,text:'대법원 2017도12345 판결 참고'}]
 })}),/CITED_PRECEDENT_PAGE_COVERAGE_FAILED/);
});

test('the supplemental report inventories original cited cases without declaring them verified',()=>{
 const report={findings:[{issueKey:'기존',claim:'기존 판단'},{issueKey:'입장료',claim:'입장료 문제',
  analysis:'쟁점의 추가 검토',sources:[{documentId:'new',page:1,part:1,hash:'b'.repeat(64)}]}],
  deltaReanalysis:{addedDocuments:[{id:'new'}],newFindings:1,supplementalFindings:0,
   changedFindings:0,unchangedFindings:1,changes:[]},
  submittedCitedPrecedentsStatus:'complete',
  submittedCitedPrecedents:[{caseNumber:'2012도14516',documentId:'new',page:1,
   citationContext:'대법원 2012도14516 판결을 본건에 인용'}]};
 const brief=buildCustomerAnalysisBrief({caseRecord:{intake:{clientRole:'plaintiff'}},report,documents:[doc('new')]});
 assert.match(brief.text,/4\. 제출자료에 인용된 판례/);
 assert.match(brief.text,/2012도14516/);
 assert.match(brief.text,/new\.pdf 1쪽/);
 assert.match(brief.text,/다음 단계 판례 검색에서 검증/);
 assert.doesNotMatch(brief.text,/제출자료에 인용된 판례 없음/);
});

test('precedent search consumes submitted citations and exposes explicit verification states',()=>{
 const api=readFileSync(new URL('../api/customer-precedents.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
 assert.match(api,/loadSubmittedCaseCitations/);
 assert.match(api,/submittedCitationChecks/);
 assert.match(api,/reviewSubmittedCitationPurposes/);
 assert.match(ui,/제출자료에 인용된 판례 검증/);
 for(const status of ['matched','mismatch','purpose_unverified','unverified'])assert.match(ui,new RegExp(status));
});
